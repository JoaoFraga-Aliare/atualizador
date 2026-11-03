import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { SignJWT } from 'jose';
import { criarPool, type Db } from './db.js';
import { migrar } from './migrate.js';
import { criarApp } from './app.js';
import { hashSenha } from './senha.js';

// Bateria de seguranca do Hub: autenticacao, isolamento entre empresas, injecao, corpos abusivos, SSRF, vazamento de
// segredos, escalada de privilegio e limites de taxa. Precisa de HUB_TEST_DATABASE_URL (banco descartavel).
const url = process.env.HUB_TEST_DATABASE_URL;
const pula = url ? false : 'defina HUB_TEST_DATABASE_URL';
const SEGREDO = 'segredo-de-teste-seguranca-123456';
const SENHA = 'senha-longa-segura-1';

let db: Db;
let server: Server;
let base = '';
let tSuper = '', tA = '', tB = '';                   // JWT: super, usuario da empresa A, usuario da empresa B
let A = '', B = '';                                   // ids das empresas
let kA = '', kB = '';                                 // chaves de API
let tmA = { id: '', token: '' }, tmB = { id: '', token: '' };
let idSuper = '';

type Resp = { status: number; corpo: any; headers: Headers; texto: string };
const chamarEm = async (raiz: string, metodo: string, caminho: string, corpo?: unknown, token?: string, extra: Record<string, string> = {}): Promise<Resp> => {
  const r = await fetch(raiz + caminho, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra },
    body: corpo === undefined ? undefined : typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  });
  const texto = await r.text();
  let json: any = null; try { json = JSON.parse(texto); } catch { /* nao e JSON */ }
  return { status: r.status, corpo: json, headers: r.headers, texto };
};
const chamar = (m: string, c: string, corpo?: unknown, t?: string, extra?: Record<string, string>) => chamarEm(base, m, c, corpo, t, extra);

before(async () => {
  if (!url) return;
  // limites folgados na suite principal (a varredura gera centenas de 401); o teste de taxa usa outra instancia
  process.env.HUB_RATE_401_MAX = '100000';
  process.env.HUB_RATE_CRED_MAX = '100000';
  process.env.HUB_RATE_LOGIN_MAX = '1000';
  process.env.HUB_RATE_LOGIN_IP_MAX = '10000';
  db = criarPool(url);
  await db.query('drop schema public cascade; create schema public;');
  await migrar(db);
  idSuper = randomUUID();
  await db.query('insert into users (id, email, nome, senha_hash, is_super) values ($1,$2,$3,$4,true)', [idSuper, 'admin@seg.test', 'Admin', await hashSenha(SENHA)]);
  server = criarApp({ db, segredo: SEGREDO }).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  tSuper = (await chamar('POST', '/v1/auth/login', { email: 'admin@seg.test', senha: SENHA })).corpo.token;
  A = (await chamar('POST', '/v1/tenants', { nome: 'Empresa A', origem: 'api' }, tSuper)).corpo.id;
  B = (await chamar('POST', '/v1/tenants', { nome: 'Empresa B', origem: 'api' }, tSuper)).corpo.id;
  await chamar('POST', `/v1/tenants/${A}/users`, { email: 'a@seg.test', nome: 'Usuario A', senha: SENHA, papel: 'integracao' }, tSuper);
  await chamar('POST', `/v1/tenants/${B}/users`, { email: 'b@seg.test', nome: 'Usuario B', senha: SENHA, papel: 'integracao' }, tSuper);
  tA = (await chamar('POST', '/v1/auth/login', { email: 'a@seg.test', senha: SENHA })).corpo.token;
  tB = (await chamar('POST', '/v1/auth/login', { email: 'b@seg.test', senha: SENHA })).corpo.token;
  kA = (await chamar('POST', `/v1/tenants/${A}/api-keys`, { nome: 'ERP A' }, tSuper)).corpo.chave;
  kB = (await chamar('POST', `/v1/tenants/${B}/api-keys`, { nome: 'ERP B' }, tSuper)).corpo.chave;
  const ta = (await chamar('POST', `/v1/tenants/${A}/terminals`, { nome: 'Caixa A' }, tSuper)).corpo;
  const tb = (await chamar('POST', `/v1/tenants/${B}/terminals`, { nome: 'Caixa B' }, tSuper)).corpo;
  tmA = { id: ta.id, token: ta.token };
  tmB = { id: tb.id, token: tb.token };
});

after(async () => {
  server?.close();
  await db?.end();
});

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

// ---------------------------------------------------------------------------------------------------------
test('cabecalhos de seguranca e sem pistas do servidor', { skip: pula }, async () => {
  const r = await chamar('GET', '/health');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-powered-by'), null);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.match(r.headers.get('cache-control') ?? '', /no-store/);
  assert.equal(r.headers.get('access-control-allow-origin'), null, 'API sem CORS aberto');
  const preflight = await chamar('OPTIONS', '/v1/me', undefined, undefined, { origin: 'https://evil.example', 'access-control-request-method': 'GET' });
  assert.equal(preflight.headers.get('access-control-allow-origin'), null);
});

// ---------------------------------------------------------------------------------------------------------
test('autenticacao: rotas protegidas recusam sem credencial, com lixo, JWT forjado e credencial de outro tipo', { skip: pula }, async () => {
  const usuario: [string, string, unknown?][] = [
    ['GET', '/v1/me'], ['GET', '/v1/docs'], ['GET', '/v1/cidades'], ['GET', '/v1/parametros'], ['GET', '/v1/resumo'],
    ['GET', '/v1/admin/logs/config'], ['PUT', '/v1/admin/logs/config', {}], ['POST', '/v1/admin/logs/limpar', { alvo: 'tudo' }],
    ['GET', '/v1/admin/logs/notificacoes'], ['POST', '/v1/tenants', { nome: 'x', origem: 'api' }],
    ['GET', `/v1/tenants/${B}`], ['DELETE', `/v1/tenants/${B}`], ['GET', `/v1/tenants/${B}/users`], ['POST', `/v1/tenants/${B}/users`, {}],
    ['GET', `/v1/tenants/${B}/terminals`], ['POST', `/v1/tenants/${B}/terminals`, { nome: 'x' }],
    ['GET', `/v1/tenants/${B}/api-keys`], ['POST', `/v1/tenants/${B}/api-keys`, { nome: 'x' }],
    ['GET', `/v1/tenants/${B}/logs`], ['GET', `/v1/tenants/${B}/espelho`], ['GET', `/v1/tenants/${B}/certificado`],
    ['PUT', `/v1/tenants/${B}/certificado`, {}], ['GET', `/v1/tenants/${B}/webhooks`], ['GET', `/v1/tenants/${B}/outbox`],
    ['GET', `/v1/tenants/${B}/prontidao`], ['GET', `/v1/tenants/${B}/conexao`], ['GET', `/v1/tenants/${B}/sync-status`],
  ];
  const terminal: [string, string, unknown?][] = [
    ['GET', '/v1/terminal/config'], ['POST', '/v1/terminal/ping', {}], ['GET', '/v1/sync/brands'], ['POST', '/v1/terminal/ops/PDVLOGIN', {}],
    ['GET', '/v1/terminal/certificado'], ['POST', '/v1/terminal/envios/nota', {}],
  ];
  const chave: [string, string, unknown?][] = [
    ['GET', '/v1/terminals'], ['POST', '/v1/terminals', { nome: 'x' }], ['POST', '/v1/terminals/numeracao', []],
    ['GET', '/v1/certificado'], ['PUT', '/v1/certificado', {}], ['POST', '/v1/brand', {}],
  ];

  // JWT forjado: assinatura de outro segredo, alg none e payload adulterado mantendo a assinatura original
  const outroSegredo = await new SignJWT({ tipo: 'usuario', super: true }).setProtectedHeader({ alg: 'HS256' }).setSubject(idSuper).setExpirationTime('1h').sign(new TextEncoder().encode('outro-segredo-qualquer-123'));
  const semAlg = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ tipo: 'usuario', super: true, sub: idSuper })}.`;
  const [h, p, s] = tA.split('.');
  const adulterado = `${h}.${b64({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), super: true })}.${s}`;
  const expirado = await new SignJWT({ tipo: 'usuario', super: true }).setProtectedHeader({ alg: 'HS256' }).setSubject(idSuper).setIssuedAt(Math.floor(Date.now() / 1000) - 7200).setExpirationTime(Math.floor(Date.now() / 1000) - 3600).sign(new TextEncoder().encode(SEGREDO));
  const tipoErrado = await new SignJWT({ tipo: 'terminal', super: true }).setProtectedHeader({ alg: 'HS256' }).setSubject(idSuper).setExpirationTime('1h').sign(new TextEncoder().encode(SEGREDO));

  const lixos = ['', 'lixo', 'Bearer', 'null', 'undefined', "' OR 1=1 --", 'a'.repeat(5000), outroSegredo, semAlg, adulterado, expirado, tipoErrado];
  for (const [m, c, corpo] of [...usuario, ...terminal, ...chave]) {
    assert.equal((await chamar(m, c, corpo)).status, 401, `sem credencial: ${m} ${c}`);
    for (const l of lixos) {
      const r = await chamarEm(base, m, c, corpo, undefined, { authorization: `Bearer ${l}` });
      assert.equal(r.status, 401, `credencial invalida (${l.slice(0, 20)}): ${m} ${c}`);
    }
  }
  // credencial de outro tipo: token de terminal e chave de API nao abrem rotas de usuario; JWT e chave nao abrem as do terminal
  for (const [m, c, corpo] of usuario) {
    assert.equal((await chamar(m, c, corpo, tmB.token)).status, 401, `token de terminal em ${m} ${c}`);
    assert.equal((await chamar(m, c, corpo, kB)).status, 401, `chave de API em ${m} ${c}`);
  }
  for (const [m, c, corpo] of terminal) {
    assert.equal((await chamar(m, c, corpo, tSuper)).status, 401, `JWT em ${m} ${c}`);
    assert.equal((await chamar(m, c, corpo, kB)).status, 401, `chave de API em ${m} ${c}`);
  }
  for (const [m, c, corpo] of chave) {
    assert.equal((await chamar(m, c, corpo, tSuper)).status, 401, `JWT em ${m} ${c}`);
    assert.equal((await chamar(m, c, corpo, tmB.token)).status, 401, `token de terminal em ${m} ${c}`);
  }
});

test('credenciais revogadas deixam de valer na hora (token do terminal, terminal desativado, chave de API)', { skip: pula }, async () => {
  const t = (await chamar('POST', `/v1/tenants/${A}/terminals`, { nome: 'Efemero' }, tSuper)).corpo;
  assert.equal((await chamar('POST', '/v1/terminal/ping', {}, t.token)).status, 200);
  const novo = (await chamar('POST', `/v1/tenants/${A}/terminals/${t.id}/token`, {}, tSuper)).corpo.token;
  assert.equal((await chamar('POST', '/v1/terminal/ping', {}, t.token)).status, 401, 'token antigo');
  assert.equal((await chamar('POST', '/v1/terminal/ping', {}, novo)).status, 200);
  await chamar('POST', `/v1/tenants/${A}/terminals/${t.id}/desativar`, {}, tSuper);
  assert.equal((await chamar('POST', '/v1/terminal/ping', {}, novo)).status, 401, 'terminal desativado');
  await chamar('DELETE', `/v1/tenants/${A}/terminals/${t.id}`, undefined, tSuper);

  const k = (await chamar('POST', `/v1/tenants/${A}/api-keys`, { nome: 'temporaria' }, tSuper)).corpo;
  assert.equal((await chamar('GET', '/v1/terminals', undefined, k.chave)).status, 200);
  await chamar('DELETE', `/v1/tenants/${A}/api-keys/${k.id}`, undefined, tSuper);
  assert.equal((await chamar('GET', '/v1/terminals', undefined, k.chave)).status, 401, 'chave revogada');
});

// ---------------------------------------------------------------------------------------------------------
test('isolamento entre empresas (IDOR): usuario, chave e terminal da empresa A nao alcancam a B', { skip: pula }, async () => {
  const idB = (await chamar('GET', `/v1/tenants/${B}/terminals`, undefined, tSuper)).corpo[0].id as string;
  const rotasB: [string, string, unknown?][] = [
    ['GET', `/v1/tenants/${B}`], ['DELETE', `/v1/tenants/${B}`], ['PUT', `/v1/tenants/${B}/padroes`, { padroes: {} }],
    ['GET', `/v1/tenants/${B}/users`], ['POST', `/v1/tenants/${B}/users`, { email: 'x@x.com', nome: 'xx', senha: SENHA }],
    ['GET', `/v1/tenants/${B}/terminals`], ['POST', `/v1/tenants/${B}/terminals`, { nome: 'invasor' }],
    ['POST', `/v1/tenants/${B}/terminals/${idB}/token`, {}], ['DELETE', `/v1/tenants/${B}/terminals/${idB}`],
    ['POST', `/v1/tenants/${B}/terminals/${idB}/desativar`, {}], ['GET', `/v1/tenants/${B}/terminals/${idB}/config`],
    ['PUT', `/v1/tenants/${B}/terminals/${idB}/config`, { valores: { cai_loja: 9 } }],
    ['GET', `/v1/tenants/${B}/api-keys`], ['POST', `/v1/tenants/${B}/api-keys`, { nome: 'invasora' }],
    ['GET', `/v1/tenants/${B}/logs`], ['GET', `/v1/tenants/${B}/espelho`], ['GET', `/v1/tenants/${B}/certificado`],
    ['PUT', `/v1/tenants/${B}/certificado`, { pfx: 'x'.repeat(200), senha: 'x' }], ['DELETE', `/v1/tenants/${B}/certificado`],
    ['GET', `/v1/tenants/${B}/certificado/acessos`], ['GET', `/v1/tenants/${B}/webhooks`], ['POST', `/v1/tenants/${B}/webhooks`, { nome: 'x', url: 'https://example.com/h', eventos: ['nota'] }],
    ['GET', `/v1/tenants/${B}/outbox`], ['GET', `/v1/tenants/${B}/prontidao`], ['GET', `/v1/tenants/${B}/conexao`], ['GET', `/v1/tenants/${B}/sync-status`],
    ['POST', `/v1/tenants/${B}/sync`, {}], ['POST', `/v1/tenants/${B}/ingest/brands`, []],
  ];
  for (const [m, c, corpo] of rotasB) {
    const r = await chamar(m, c, corpo, tA);
    assert.ok([403, 404].includes(r.status), `usuario A em ${m} ${c}: ${r.status} ${r.texto.slice(0, 120)}`);
  }
  // funcoes so do administrador do Hub
  for (const [m, c, corpo] of [['POST', '/v1/tenants', { nome: 'x', origem: 'api' }], ['GET', '/v1/resumo'], ['GET', '/v1/admin/logs/config'],
    ['PUT', '/v1/admin/logs/config', { diasLog: 1 }], ['POST', '/v1/admin/logs/limpar', { alvo: 'tudo' }], ['GET', '/v1/admin/logs/notificacoes'],
    ['POST', '/v1/cidades/ibge/carregar', {}]] as [string, string, unknown?][]) {
    assert.equal((await chamar(m, c, corpo, tA)).status, 403, `usuario A em ${m} ${c}`);
  }
  // o usuario da A nao e tenant_admin: nao cria usuarios nem chaves na propria empresa
  assert.equal((await chamar('POST', `/v1/tenants/${A}/users`, { email: 'novo@seg.test', nome: 'Novo', senha: SENHA }, tA)).status, 403);
  assert.equal((await chamar('DELETE', `/v1/tenants/${A}`, undefined, tA)).status, 403);
  // lista de empresas do proprio usuario so mostra a dele
  assert.deepEqual((await chamar('GET', '/v1/me', undefined, tA)).corpo.tenants.map((x: any) => x.id), [A]);

  // chave de API da A em recursos da B (por id)
  assert.equal((await chamar('GET', `/v1/terminals/${idB}`, undefined, kA)).status, 404);
  assert.equal((await chamar('PATCH', `/v1/terminals/${idB}`, { nome: 'sequestrado' }, kA)).status, 404);
  assert.equal((await chamar('POST', `/v1/terminals/${idB}/token`, {}, kA)).status, 404);
  assert.equal((await chamar('DELETE', `/v1/terminals/${idB}`, undefined, kA)).status, 404);
  assert.deepEqual(((await chamar('GET', '/v1/terminals', undefined, kA)).corpo.terminais as any[]).map((x) => x.id), [tmA.id]);
  assert.equal((await chamar('GET', `/v1/terminals/${idB}`, undefined, kB)).status, 200, 'a B continua acessando o proprio terminal');
  // nada mudou na B
  assert.equal((await db.query('select nome from terminals where id = $1', [idB])).rows[0].nome, 'Caixa B');
  assert.equal((await db.query('select count(*)::int as n from terminals where tenant_id = $1', [B])).rows[0].n, 1);
  assert.equal((await db.query('select count(*)::int as n from api_keys where tenant_id = $1', [B])).rows[0].n, 1);
  // terminal da A so enxerga dados da A
  assert.ok((await chamar('GET', '/v1/terminal/config', undefined, tmA.token)).status === 200);
});

// ---------------------------------------------------------------------------------------------------------
test('injecao de SQL e entradas hostis em query, caminho e corpo: nunca 500 e nada e alterado', { skip: pula }, async () => {
  const payloads = ["' OR '1'='1", "'; drop table tenants; --", '" OR ""="', '1; select pg_sleep(5)', '%', '_', '\\', '%00', '\u0000', '../../etc/passwd',
    '${7*7}', '{{7*7}}', '<script>alert(1)</script>', 'a'.repeat(3000), '‮﻿', "1' UNION SELECT senha_hash FROM users--"];
  const antes = (await db.query('select (select count(*) from tenants) as t, (select count(*) from users) as u, (select count(*) from terminals) as m')).rows[0];
  const t0 = Date.now();
  for (const p of payloads) {
    const q = encodeURIComponent(p);
    const gets = [
      `/v1/tenants/${A}/logs?terminal=${q}&canal=${q}&resultado=${q}&rota=${q}&antes=${q}`, `/v1/tenants/${A}/espelho?busca=${q}&pagina=${q}`,
      `/v1/tenants/${A}/espelho/brands?busca=${q}&limite=${q}`, `/v1/cidades?busca=${q}&uf=${q}&pagina=${q}`, `/v1/sync/${q}?desde=${q}&limite=${q}`,
      `/v1/tenants/${q}`, `/v1/tenants/${A}/terminals/${q}/config`, `/v1/tenants/${A}/logs/${q}`, `/v1/tenants/${A}/outbox?status=${q}`,
      `/v1/parametros?origem=${q}`, `/v1/tenants/${A}/webhooks/entregas?evento=${q}`,
    ];
    for (const g of gets) {
      const r = await chamar('GET', g, undefined, tSuper);
      assert.ok(r.status < 500, `GET ${g.slice(0, 80)}: ${r.status} ${r.texto.slice(0, 160)}`);
      assert.doesNotMatch(r.texto, /syntax error at|invalid input syntax|relation "|column "|node_modules|Projetos/i, `vazou detalhe interno em ${g.slice(0, 60)}: ${r.texto.slice(0, 300)}`);
    }
    for (const [m, c, corpo] of [
      ['POST', '/v1/auth/login', { email: p, senha: p }], ['POST', '/v1/auth/login', { email: `${p}@x.com`, senha: p }],
      ['POST', `/v1/tenants`, { nome: p, origem: 'api', documento: p }], ['POST', `/v1/tenants/${A}/terminals`, { nome: p, codigoLegado: p }],
      ['PUT', `/v1/tenants/${A}/terminals/${tmA.id}/config`, { valores: { cai_nomeloja: p, [p]: p } }],
      ['POST', '/v1/terminals', { codigo: p, nome: p, empresa: { razaoSocial: p }, parametros: { [p]: p } }],
      ['POST', '/v1/brand', [{ codigo: p, nome: p }]], ['POST', '/v1/terminals/numeracao', [{ codigo: p, ultimaNfce: p }]],
      ['POST', `/v1/tenants/${A}/webhooks`, { nome: p, url: p, eventos: [p] }],
    ] as [string, string, unknown][]) {
      const token = c === '/v1/auth/login' ? undefined : c === '/v1/terminals' || c === '/v1/brand' || c === '/v1/terminals/numeracao' ? kA : tSuper;
      const r = await chamar(m, c, corpo, token);
      assert.ok(r.status < 500, `${m} ${c} com payload hostil: ${r.status} ${r.texto.slice(0, 160)}`);
    }
  }
  assert.ok(Date.now() - t0 < 60_000, 'sem pg_sleep: a injecao nao pode atrasar as respostas');
  const depois = (await db.query('select (select count(*) from tenants) as t, (select count(*) from users) as u, (select count(*) from terminals) as m')).rows[0];
  // tenants e terminais criados pelos payloads validos (nome hostil e so texto) podem aumentar; users nunca
  assert.equal(depois.u, antes.u);
  assert.ok(Number(depois.t) >= Number(antes.t));
  assert.equal((await db.query("select to_regclass('public.tenants') as t")).rows[0].t, 'tenants', 'a tabela continua la');
  assert.equal((await db.query("select count(*)::int as n from users where is_super")).rows[0].n, 1);
});

test('corpos abusivos: JSON invalido, grande demais, profundo, nao-objeto e poluicao de prototipo', { skip: pula }, async () => {
  // JSON invalido: 400 sem stack
  const ruim = await chamar('POST', '/v1/auth/login', '{"email": ', undefined);
  assert.equal(ruim.status, 400);
  assert.doesNotMatch(ruim.texto, /SyntaxError|at \w+|node_modules/);
  // anonimo: corpo pequeno (64 KB); com credencial, o limite grande vale
  const grandeAnonimo = await chamar('POST', '/v1/auth/login', { email: 'a@b.com', senha: 'x'.repeat(100_000) });
  assert.equal(grandeAnonimo.status, 413);
  const enorme = await chamar('POST', '/v1/brand', '[' + '1,'.repeat(11_000_000) + '1]', kA);
  assert.equal(enorme.status, 413);
  // lote acima do limite de linhas e recusado, nao derruba
  const lote = await chamar('POST', '/v1/brand', Array.from({ length: 6000 }, (_, i) => ({ codigo: i, nome: 'x' })), kA);
  assert.ok(lote.status >= 400 && lote.status < 500, `lote de 6000: ${lote.status}`);
  // JSON profundo, texto puro e tipos trocados
  for (const corpo of ['{"a":'.repeat(5000) + '1' + '}'.repeat(5000), '"texto"', '123', 'null', '[]', '{}', '[[[[[]]]]]']) {
    for (const [c, tok] of [['/v1/auth/login', undefined], ['/v1/brand', kA], ['/v1/terminals', kA], [`/v1/tenants/${A}/terminals`, tSuper]] as [string, string | undefined][]) {
      const r = await chamar('POST', c, corpo, tok);
      assert.ok(r.status < 500, `${c} com corpo ${corpo.slice(0, 20)}: ${r.status} ${r.texto.slice(0, 120)}`);
    }
  }
  // poluicao de prototipo
  const veneno = '{"__proto__":{"polluted":"sim"},"constructor":{"prototype":{"polluted":"sim"}},"nome":"x"}';
  for (const [c, tok] of [['/v1/terminals', kA], ['/v1/brand', kA], [`/v1/tenants/${A}/terminals`, tSuper], [`/v1/tenants/${A}/terminals/${tmA.id}/config`, tSuper]] as [string, string][]) {
    const r = await chamar(c.endsWith('/config') ? 'PUT' : 'POST', c, veneno, tok);
    assert.ok(r.status < 500, `proto em ${c}: ${r.status}`);
  }
  assert.equal(({} as any).polluted, undefined, 'Object.prototype nao pode ser poluido');
  assert.equal((Object.prototype as any).polluted, undefined);
  // metodos e rotas inexistentes: 404 limpo
  for (const [m, c] of [['TRACE', '/v1/me'], ['GET', '/v1/../etc/passwd'], ['GET', '/v1/%2e%2e/%2e%2e/etc/passwd'], ['GET', '/.env'], ['GET', '/v1/admin']] as [string, string][]) {
    const r = await chamar(m, c, undefined, tSuper).catch(() => ({ status: 400, texto: '' } as Resp));
    assert.ok([400, 404, 405].includes(r.status), `${m} ${c}: ${r.status}`);
    assert.doesNotMatch(r.texto, /root:|DATABASE_URL|HUB_JWT_SECRET/);
  }
});

// ---------------------------------------------------------------------------------------------------------
test('SSRF: webhooks e destinos de rede interna nao sao alcancados', { skip: pula }, async () => {
  delete process.env.HUB_WEBHOOK_REDE_INTERNA;
  const hostis = ['http://169.254.169.254/latest/meta-data/', 'http://127.0.0.1/', 'http://localhost/', 'file:///etc/passwd', 'ftp://example.com/x',
    'gopher://127.0.0.1:6379/_x', 'javascript:alert(1)', 'https://user:senha@example.com/h', 'http://[::1]/', 'http://0.0.0.0/',
    'https://[::ffff:7f00:1]/', 'https://[::ffff:127.0.0.1]/', 'https://2130706433/', 'https://0x7f.0.0.1/', 'https://017700000001/',
    'https://127.1/', 'https://10.0.0.5/', 'https://192.168.1.10/', 'https://172.16.0.9/', 'https://100.64.0.1/', 'https://169.254.169.254/',
    'https://[fd00::1]/', 'https://[fe80::1]/', 'https://localhost/', 'https://localtest.me/'];
  for (const u of hostis) {
    const criado = await chamar('POST', `/v1/tenants/${A}/webhooks`, { nome: 'ssrf', url: u, eventos: ['nota'] }, tSuper);
    if (criado.status >= 400) { assert.ok(criado.status < 500 || criado.status === 422, `${u}: ${criado.status}`); continue; }
    // aceitou o cadastro (https): na entrega, o destino interno tem que ser barrado antes de conectar
    const teste = await chamar('POST', `/v1/tenants/${A}/webhooks/${criado.corpo.id}/testar`, {}, tSuper);
    assert.equal(teste.corpo?.ok, false, `webhook ${u} foi entregue: ${teste.texto.slice(0, 200)}`);
    assert.match(String(teste.corpo?.erro ?? ''), /rede interna|nao permitido|resolver|invalida|ENOTFOUND|EAI_AGAIN|lookup/i, `${u}: ${teste.texto.slice(0, 200)}`);
  }
  // redirecionamento para rede interna nao e seguido
  assert.equal(((await db.query("select count(*)::int as n from webhooks where url ~ '^(file|gopher|ftp|javascript):'")).rows[0].n), 0);
});

// ---------------------------------------------------------------------------------------------------------
test('vazamento de segredos: hashes, tokens e senhas nunca aparecem em respostas nem no log', { skip: pula }, async () => {
  const todas: Resp[] = [
    await chamar('GET', `/v1/tenants/${A}/users`, undefined, tSuper), await chamar('GET', '/v1/me', undefined, tA),
    await chamar('GET', `/v1/tenants/${A}/terminals`, undefined, tSuper), await chamar('GET', `/v1/tenants/${A}/api-keys`, undefined, tSuper),
    await chamar('GET', `/v1/tenants/${A}/terminals/${tmA.id}/config`, undefined, tSuper), await chamar('GET', '/v1/terminals', undefined, kA),
    await chamar('GET', `/v1/terminals/${tmA.id}`, undefined, kA), await chamar('GET', `/v1/tenants/${A}`, undefined, tSuper),
    await chamar('GET', `/v1/tenants/${A}/logs`, undefined, tSuper), await chamar('GET', `/v1/tenants/${A}/conexao`, undefined, tSuper),
    await chamar('POST', '/v1/auth/login', { email: 'a@seg.test', senha: SENHA }), await chamar('GET', `/v1/tenants/${A}/certificado`, undefined, tSuper),
  ];
  const texto = todas.map((r) => r.texto).join('\n');
  assert.doesNotMatch(texto, /scrypt\$/, 'hash de senha');
  assert.doesNotMatch(texto, /"(senha_hash|token_hash|chave_hash|segredo_cifrado|pfx_cifrado|senha_cifrada)"\s*:/);
  assert.ok(!texto.includes(tmA.token) && !texto.includes(tmB.token), 'token de terminal so aparece na criacao');
  assert.ok(!texto.includes(kA) && !texto.includes(kB), 'chave de API so aparece na criacao');
  // o log de requisicoes nao guarda credenciais nem senhas
  await chamar('POST', '/v1/terminals', { codigo: 'seg', nome: 'Seg', parametros: { cai_nomeloja: 'x' } }, kA);
  await chamar('POST', `/v1/tenants/${A}/users`, { email: 'z@seg.test', nome: 'Zed', senha: 'segredo-que-nao-pode-vazar', papel: 'integracao' }, tSuper);
  const logs = JSON.stringify((await db.query('select rota, mensagem, req_corpo, resp_corpo from request_log')).rows);
  assert.ok(!logs.includes(kA) && !logs.includes(tmA.token) && !logs.includes('segredo-que-nao-pode-vazar'));
  // enumeracao de usuarios: mesma resposta para e-mail inexistente e senha errada
  const inexistente = await chamar('POST', '/v1/auth/login', { email: 'ninguem@seg.test', senha: 'qualquer-senha-1' });
  const errada = await chamar('POST', '/v1/auth/login', { email: 'a@seg.test', senha: 'senha-errada-1' });
  assert.deepEqual([inexistente.status, inexistente.corpo], [errada.status, errada.corpo]);
  // erros internos nao expõem detalhes
  const r = await chamar('GET', `/v1/tenants/${A}/logs/abc`, undefined, tSuper);
  assert.doesNotMatch(r.texto, /invalid input syntax|pg_catalog|relation "|column "/i);
});

test('escalada de privilegio e atribuicao em massa', { skip: pula }, async () => {
  // campos extras no cadastro de usuario nao viram super nem trocam de empresa
  const r = await chamar('POST', `/v1/tenants/${A}/users`, { email: 'esc@seg.test', nome: 'Escalada', senha: SENHA, papel: 'integracao', is_super: true, super: true, tenant_id: B }, tSuper);
  assert.ok(r.status === 201 || r.status === 400 || r.status === 422, `${r.status} ${r.texto}`);
  if (r.status === 201) {
    const tok = (await chamar('POST', '/v1/auth/login', { email: 'esc@seg.test', senha: SENHA })).corpo.token;
    assert.equal((await chamar('GET', '/v1/resumo', undefined, tok)).status, 403, 'nao virou super');
    assert.equal((await chamar('GET', `/v1/tenants/${B}`, undefined, tok)).status, 403, 'nao entrou na B');
  }
  assert.equal((await chamar('POST', `/v1/tenants/${A}/users`, { email: 'sup@seg.test', nome: 'Super', senha: SENHA, papel: 'super_admin' }, tSuper)).status >= 400, true, 'papel inventado');
  // PATCH de terminal com campos que nao existem no contrato: recusa (strict) em vez de gravar
  for (const extra of [{ tenant_id: B }, { token_hash: 'x' }, { id: randomUUID() }, { ativo: 1, tenantId: B }]) {
    const p = await chamar('PATCH', `/v1/terminals/${tmA.id}`, extra, kA);
    assert.ok(p.status === 422 || p.status === 400, `campo extra ${JSON.stringify(extra)}: ${p.status}`);
  }
  assert.equal((await db.query('select tenant_id from terminals where id = $1', [tmA.id])).rows[0].tenant_id, A);
  // chave de API nao cria empresa nem usuario
  assert.ok([401, 403, 404].includes((await chamar('POST', '/v1/tenants', { nome: 'x', origem: 'api' }, kA)).status));
  // senha fraca recusada
  assert.ok((await chamar('POST', `/v1/tenants/${A}/users`, { email: 'fraca@seg.test', nome: 'Fraca', senha: '123' }, tSuper)).status >= 400);
});

// ---------------------------------------------------------------------------------------------------------
test('limites de taxa: forca bruta no login, chute de credencial e abuso por credencial', { skip: pula }, async () => {
  // instancia propria com limites pequenos (os limites sao lidos ao criar o app)
  const antes = { ...process.env };
  process.env.HUB_RATE_LOGIN_MAX = '4';
  process.env.HUB_RATE_LOGIN_IP_MAX = '8';
  process.env.HUB_RATE_LOGIN_JANELA_S = '60';
  process.env.HUB_RATE_401_MAX = '12';
  process.env.HUB_RATE_CRED_MAX = '30';
  const s2 = criarApp({ db, segredo: SEGREDO }).listen(0);
  const b2 = `http://127.0.0.1:${(s2.address() as AddressInfo).port}`;
  Object.assign(process.env, antes);
  try {
    // forca bruta no mesmo e-mail: bloqueia depois de 4 falhas, mesmo com a senha certa
    const falhas: number[] = [];
    for (let i = 0; i < 4; i++) falhas.push((await chamarEm(b2, 'POST', '/v1/auth/login', { email: 'a@seg.test', senha: `errada-${i}-xxxx` })).status);
    assert.deepEqual(falhas, [401, 401, 401, 401]);
    const bloqueado = await chamarEm(b2, 'POST', '/v1/auth/login', { email: 'a@seg.test', senha: SENHA });
    assert.equal(bloqueado.status, 429, 'a senha certa tambem e barrada durante o bloqueio');
    assert.ok(Number(bloqueado.headers.get('retry-after')) >= 1);
    // outro e-mail do mesmo IP ainda tem tentativas (ate o limite por IP) e depois tambem e barrado
    assert.equal((await chamarEm(b2, 'POST', '/v1/auth/login', { email: 'b@seg.test', senha: SENHA })).status, 200);
    for (let i = 0; i < 8; i++) await chamarEm(b2, 'POST', '/v1/auth/login', { email: `x${i}@seg.test`, senha: 'qualquer-senha-1' });
    assert.equal((await chamarEm(b2, 'POST', '/v1/auth/login', { email: 'b@seg.test', senha: SENHA })).status, 429, 'limite por IP (varios e-mails)');

  } finally { s2.close(); }

  // chute de token/chave: depois de muitas respostas 401 o IP e barrado ate para credencial valida
  process.env.HUB_RATE_401_MAX = '12';
  process.env.HUB_RATE_CRED_MAX = '100000';
  process.env.HUB_RATE_LOGIN_MAX = '1000';
  const s4 = criarApp({ db, segredo: SEGREDO }).listen(0);
  const b4 = `http://127.0.0.1:${(s4.address() as AddressInfo).port}`;
  Object.assign(process.env, antes);
  try {
    for (let i = 0; i < 12; i++) assert.equal((await chamarEm(b4, 'GET', '/v1/terminals', undefined, `hk_chute_${i}`)).status, 401);
    const barrado = await chamarEm(b4, 'GET', '/v1/terminals', undefined, kA);
    assert.equal(barrado.status, 429);
    assert.ok(Number(barrado.headers.get('retry-after')) >= 1);
  } finally { s4.close(); }

  // limite por credencial: 30 por minuto na instancia de teste, sem afetar outras credenciais
  process.env.HUB_RATE_CRED_MAX = '30';
  process.env.HUB_RATE_401_MAX = '100000';
  process.env.HUB_RATE_LOGIN_MAX = '1000';
  const s3 = criarApp({ db, segredo: SEGREDO }).listen(0);
  const b3 = `http://127.0.0.1:${(s3.address() as AddressInfo).port}`;
  Object.assign(process.env, antes);
  try {
    const codigos: number[] = [];
    for (let i = 0; i < 40; i++) codigos.push((await chamarEm(b3, 'GET', '/v1/terminals', undefined, kA)).status);
    assert.equal(codigos.filter((c) => c === 200).length, 30);
    assert.equal(codigos.filter((c) => c === 429).length, 10);
    assert.equal((await chamarEm(b3, 'GET', '/v1/terminals', undefined, kB)).status, 200, 'a chave da B tem a propria cota');
  } finally { s3.close(); }
});

test('carga: o Hub segura rajadas concorrentes sem erro 5xx e sem degradar a latencia', { skip: pula }, async () => {
  const total = 600, concorrencia = 40;
  const lat: number[] = [];
  const status = new Map<number, number>();
  let i = 0;
  const trabalhador = async () => {
    while (i < total) {
      const n = i++;
      const t0 = performance.now();
      const r = n % 3 === 0 ? await chamar('POST', '/v1/terminal/ping', {}, tmA.token)
        : n % 3 === 1 ? await chamar('GET', '/v1/terminals', undefined, kA)
          : await chamar('GET', `/v1/tenants/${A}/terminals`, undefined, tA);
      lat.push(performance.now() - t0);
      status.set(r.status, (status.get(r.status) ?? 0) + 1);
    }
  };
  const t0 = performance.now();
  await Promise.all(Array.from({ length: concorrencia }, trabalhador));
  const seg = (performance.now() - t0) / 1000;
  lat.sort((a, b) => a - b);
  const p = (q: number) => lat[Math.min(lat.length - 1, Math.floor(lat.length * q))];
  console.log(`carga: ${total} req em ${seg.toFixed(1)}s (${(total / seg).toFixed(0)} req/s) p50=${p(0.5).toFixed(0)}ms p95=${p(0.95).toFixed(0)}ms p99=${p(0.99).toFixed(0)}ms status=${JSON.stringify([...status])}`);
  assert.equal([...status.keys()].filter((c) => c >= 500).length, 0, '5xx sob carga');
  assert.equal(status.get(200), total, 'todas as requisicoes legitimas atendidas');
  assert.ok(p(0.95) < 2000, `p95 ${p(0.95).toFixed(0)}ms`);
  // login com scrypt e caro: rajada de logins invalidos nao pode travar as demais requisicoes
  const t1 = performance.now();
  await Promise.all([...Array.from({ length: 20 }, (_, k) => chamar('POST', '/v1/auth/login', { email: `flood${k}@seg.test`, senha: 'qualquer-senha-1' })), chamar('GET', '/health')]);
  assert.ok(performance.now() - t1 < 15_000, 'login flood nao derruba o servidor');
  assert.equal((await chamar('GET', '/health')).status, 200);
});
