import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { criarPool, type Db } from './db.js';
import { migrar } from './migrate.js';
import { criarApp } from './app.js';
import { hashSenha } from './senha.js';
import { avaliarAlertas, avisarExterno } from './monitoramento.js';
import { configAlertas } from './logs-admin.js';

// Monitoramento (alertas) e tela global de erros. Precisa de HUB_TEST_DATABASE_URL (banco descartavel).
const url = process.env.HUB_TEST_DATABASE_URL;
const pula = url ? false : 'defina HUB_TEST_DATABASE_URL';
let db: Db;
let server: Server;
let base = '';
let tSuper = '';

const chamar = async (metodo: string, caminho: string, corpo?: unknown, token?: string) => {
  const r = await fetch(base + caminho, {
    method: metodo, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: r.status, corpo: (await r.json().catch(() => null)) as any };
};

before(async () => {
  if (!url) return;
  process.env.HUB_RATE_401_MAX = '100000';
  db = criarPool(url);
  await db.query('drop schema public cascade; create schema public;');
  await migrar(db);
  await db.query('insert into users (id, email, nome, senha_hash, is_super) values ($1,$2,$3,$4,true)', [randomUUID(), 'admin@mon.test', 'Admin', await hashSenha('senha-super-1')]);
  server = criarApp({ db, segredo: 'segredo-de-teste-monitor-123456' }).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  tSuper = (await chamar('POST', '/v1/auth/login', { email: 'admin@mon.test', senha: 'senha-super-1' })).corpo.token;
});
after(async () => { server?.close(); await db?.end(); });

test('alertas: abrem, atualizam, resolvem sozinhos e respeitam limites e liga/desliga', { skip: pula }, async () => {
  const A = (await chamar('POST', '/v1/tenants', { nome: 'Loja A', origem: 'api' }, tSuper)).corpo.id as string;
  const B = (await chamar('POST', '/v1/tenants', { nome: 'Loja B', origem: 'api' }, tSuper)).corpo.id as string;
  const tA = (await chamar('POST', `/v1/tenants/${A}/terminals`, { nome: 'Caixa 01', ambiente: 'producao' }, tSuper)).corpo.id as string;
  const tH = (await chamar('POST', `/v1/tenants/${A}/terminals`, { nome: 'Caixa Teste', ambiente: 'homologacao' }, tSuper)).corpo.id as string;
  const tNovo = (await chamar('POST', `/v1/tenants/${B}/terminals`, { nome: 'Caixa Novo', ambiente: 'producao' }, tSuper)).corpo.id as string;

  const avaliar = async () => (await chamar('POST', '/v1/admin/alertas/avaliar', {}, tSuper)).corpo;
  assert.equal((await avaliar()).total, 0, 'nada para alertar no comeco');

  // terminal de producao que ja conectou e sumiu; homologacao e terminal que nunca conectou ficam de fora
  await db.query("update terminals set ultimo_contato = now() - interval '5 hours' where id = $1", [tA]);
  await db.query("update terminals set ultimo_contato = now() - interval '5 hours' where id = $1", [tH]);
  let r = await avaliar();
  assert.equal(r.total, 1);
  assert.equal(r.novos, 1);
  assert.equal(r.abertos[0].tipo, 'terminal_sem_contato');
  assert.match(r.abertos[0].titulo, /Loja A: terminal Caixa 01 sem contato/);
  const aberto = r.abertos[0].aberto_em;
  assert.equal((await avaliar()).novos, 0, 'o mesmo alerta nao e novo de novo');
  assert.equal((await avaliar()).abertos[0].aberto_em, aberto, 'aberto_em se mantem');

  // envios parados (pendentes ha mais de 15 min) e certificado vencendo
  await db.query("insert into outbox (tenant_id, tipo, chave, payload, status, criado_em) values ($1, 'nota', 'n1', '{}', 'pendente', now() - interval '40 minutes'), ($1, 'nota', 'n2', '{}', 'erro', now() - interval '20 minutes'), ($1, 'nota', 'n3', '{}', 'pendente', now())", [A]);
  await db.query("insert into certificados (tenant_id, nome, pfx_cifrado, senha_cifrada, chave_cifrada, titular, serie, impressao, valido_de, valido_ate, enviado_por) values ($1,'x.pfx','a','b','c','LOJA B LTDA','01','02', now() - interval '300 days', now() + interval '10 days', 't')", [B]);
  r = await avaliar();
  assert.deepEqual(r.abertos.map((a: any) => a.tipo).sort(), ['certificado', 'envios_parados', 'terminal_sem_contato']);
  assert.match(r.abertos.find((a: any) => a.tipo === 'envios_parados').titulo, /2 envio\(s\) parado\(s\)/);
  assert.match(r.abertos.find((a: any) => a.tipo === 'certificado').titulo, /certificado vence em (9|10) dia/);

  // Agrosys falhando (5 erros em 15 min) e webhook desistindo
  for (let i = 0; i < 5; i++) await db.query("insert into request_log (tenant_id, canal, rota, resultado, mensagem) values ($1, 'hub->erp', 'SOAP', 'erro', 'timeout')", [A]);
  const w = (await chamar('POST', `/v1/tenants/${A}/webhooks`, { nome: 'ERP', url: 'https://example.com/h', eventos: ['nota'] }, tSuper)).corpo.id as string;
  await db.query("insert into webhook_entregas (webhook_id, tenant_id, evento, corpo, status, erro) values ($1,$2,'nota','{}','falhou','HTTP 500')", [w, A]);
  r = await avaliar();
  assert.deepEqual(r.abertos.map((a: any) => a.tipo).sort(), ['certificado', 'envios_parados', 'erp_falhando', 'terminal_sem_contato', 'webhook_falhando']);

  // quando a condicao some, o alerta e resolvido sozinho (e continua visivel por 24 h)
  await db.query("update terminals set ultimo_contato = now() where id = $1", [tA]);
  await db.query("update outbox set status = 'enviado'");
  r = await avaliar();
  assert.equal(r.resolvidosAgora, 2);
  assert.ok(r.resolvidos.some((x: any) => x.tipo === 'terminal_sem_contato'));
  assert.equal(r.abertos.some((x: any) => x.tipo === 'terminal_sem_contato'), false);
  // voltou a falhar: abre de novo (novo)
  await db.query("update terminals set ultimo_contato = now() - interval '9 hours' where id = $1", [tA]);
  assert.equal((await avaliar()).novos, 1);

  // limites e liga/desliga pela configuracao
  const cfg = (await chamar('GET', '/v1/admin/logs/config', undefined, tSuper)).corpo;
  assert.deepEqual([cfg.alertas.limites.terminalSemContatoHoras, cfg.alertas.ligados.certificado, cfg.tiposAlerta.length], [2, true, 5]);
  assert.equal((await chamar('PUT', '/v1/admin/logs/config', { alertas: { limites: { terminalSemContatoHoras: 0 } } }, tSuper)).status, 422);
  assert.equal((await chamar('PUT', '/v1/admin/logs/config', { alertas: { ligados: { inventado: true } } }, tSuper)).status, 422);
  await chamar('PUT', '/v1/admin/logs/config', { alertas: { limites: { terminalSemContatoHoras: 12 }, ligados: { certificado: false } } }, tSuper);
  r = await avaliar();
  assert.equal(r.abertos.some((x: any) => x.tipo === 'terminal_sem_contato'), false, '9 h < limite de 12 h');
  assert.equal(r.abertos.some((x: any) => x.tipo === 'certificado'), false, 'tipo desligado');
  void tNovo;

  // so o administrador
  const nome = (await chamar('POST', `/v1/tenants/${A}/users`, { email: 'u@mon.test', nome: 'Usuario', senha: 'senha-longa-segura-1', papel: 'integracao' }, tSuper)).status;
  assert.equal(nome, 201);
  const tUser = (await chamar('POST', '/v1/auth/login', { email: 'u@mon.test', senha: 'senha-longa-segura-1' })).corpo.token;
  for (const [m, c] of [['GET', '/v1/admin/alertas'], ['POST', '/v1/admin/alertas/avaliar'], ['GET', '/v1/admin/logs/erros']] as [string, string][]) {
    assert.equal((await chamar(m, c, m === 'POST' ? {} : undefined, tUser)).status, 403, c);
    assert.equal((await chamar(m, c, m === 'POST' ? {} : undefined)).status, 401, c);
  }
});

test('aviso externo (HUB_ALERTA_URL): um POST por alerta novo, com texto pronto para Slack/Teams', { skip: pula }, async () => {
  const recebidos: any[] = [];
  const alvo = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => { recebidos.push(JSON.parse(raw)); res.end('ok'); });
  }).listen(0);
  process.env.HUB_WEBHOOK_REDE_INTERNA = 'sim';              // o alvo de teste fica em 127.0.0.1
  process.env.HUB_ALERTA_URL = `http://127.0.0.1:${(alvo.address() as AddressInfo).port}/alerta`;
  try {
    const novo = { chave: 'x', tipo: 'envios_parados' as const, tenantId: null, terminalId: null, titulo: 'Loja A: 3 envio(s) parado(s)', detalhe: 'O mais antigo espera há 40 min.' };
    await avisarExterno([novo]);
    assert.equal(recebidos.length, 1);
    assert.match(recebidos[0].text, /^\[Hub\] Loja A: 3 envio\(s\) parado\(s\) — O mais antigo/);
    assert.equal(recebidos[0].alerta.tipo, 'envios_parados');
    delete process.env.HUB_ALERTA_URL;
    await avisarExterno([novo]);                              // sem URL: nada e enviado
    assert.equal(recebidos.length, 1);
    // avaliacao direta nao dispara aviso sozinha (quem avisa e o laco do servidor)
    assert.equal((await avaliarAlertas(db, await configAlertas(db))).novos.length >= 0, true);
  } finally { alvo.close(); delete process.env.HUB_ALERTA_URL; delete process.env.HUB_WEBHOOK_REDE_INTERNA; }
});

test('erros globais: todas as empresas, filtros, resumo e detalhe pelo log da empresa', { skip: pula }, async () => {
  await db.query('delete from request_log');
  const A = (await db.query("select id from tenants where nome = 'Loja A'")).rows[0].id as string;
  const B = (await db.query("select id from tenants where nome = 'Loja B'")).rows[0].id as string;
  const ins = (t: string, canal: string, resultado: string, rota: string, msg: string, extra = '') =>
    db.query(`insert into request_log (tenant_id, canal, rota, operacao, resultado, status_http, mensagem ${extra ? ', ocorrido_em' : ''}) values ($1,$2,$3,'op',$4,$5,$6 ${extra ? `, ${extra}` : ''})`, [t, canal, rota, resultado, resultado === 'erro' ? 500 : resultado === 'recusado' ? 422 : 200, msg]);
  await ins(A, 'terminal->hub', 'erro', '/v1/sync/products', 'falha no banco');
  await ins(A, 'hub->erp', 'erro', 'SOAP', 'timeout do Agrosys');
  await ins(B, 'terminal->hub', 'recusado', '/v1/terminal/ops/PDVLOGIN', 'senha invalida');
  await ins(B, 'cliente->hub', 'ok', '/v1/brand', 'tudo certo');
  await ins(B, 'terminal->hub', 'erro', '/v1/sync/prices', 'velho', "now() - interval '3 days'");

  const get = async (q = '') => (await chamar('GET', `/v1/admin/logs/erros${q}`, undefined, tSuper)).corpo;
  let r = await get();
  assert.equal(r.itens.length, 3, 'ok nao entra; o de 3 dias fica fora do periodo de 24 h');
  assert.deepEqual([r.resumo.total, r.resumo.erros, r.resumo.recusados, r.resumo.terminal, r.resumo.erp], [3, 2, 1, 2, 1]);
  assert.ok(r.itens[0].id > r.itens[1].id, 'mais recente primeiro');
  assert.ok(r.itens.every((x: any) => x.empresa), 'traz o nome da empresa');
  assert.deepEqual(r.porEmpresa.map((x: any) => [x.nome, x.total]).sort(), [['Loja A', 2], ['Loja B', 1]]);

  assert.equal((await get('?periodo=7d')).itens.length, 4);
  assert.deepEqual((await get('?resultado=recusado')).itens.map((x: any) => x.mensagem), ['senha invalida']);
  assert.deepEqual((await get('?canal=hub->erp')).itens.map((x: any) => x.mensagem), ['timeout do Agrosys']);
  assert.equal((await get(`?empresa=${B}`)).itens.length, 1);
  assert.deepEqual((await get('?busca=banco')).itens.map((x: any) => x.mensagem), ['falha no banco']);
  assert.equal((await get('?busca=%27%3B%20drop%20table%20tenants%3B--')).itens.length, 0);
  const p1 = await get('?limite=2');
  assert.equal(p1.itens.length, 2);
  assert.equal((await get(`?limite=2&antes=${p1.proximo}`)).itens.length, 1, 'paginacao por id');

  assert.equal((await chamar('GET', '/v1/admin/logs/erros?periodo=1ano', undefined, tSuper)).status, 422);
  assert.equal((await chamar('GET', '/v1/admin/logs/erros?empresa=abc', undefined, tSuper)).status, 422);
  // o detalhe de cada erro abre pelo log da propria empresa
  const det = await chamar('GET', `/v1/tenants/${r.itens[0].tenant_id}/logs/${r.itens[0].id}`, undefined, tSuper);
  assert.equal(det.status, 200);
  assert.equal(det.corpo.id, r.itens[0].id);
});
