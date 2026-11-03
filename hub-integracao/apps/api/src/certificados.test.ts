import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import forge from 'node-forge';
import { criarPool, type Db } from './db.js';
import { migrar } from './migrate.js';
import { criarApp } from './app.js';
import { hashSenha } from './senha.js';
import { analisarPfx, cifrarCertificado, decifrarCertificado } from './certificados.js';

// Precisa de um Postgres de teste: HUB_TEST_DATABASE_URL (banco descartavel).
const url = process.env.HUB_TEST_DATABASE_URL;
const pula = url ? false : 'defina HUB_TEST_DATABASE_URL';

let db: Db;
let server: Server;
let base = '';

// .pfx de teste (autoassinado, 3DES como os A1 da ICP-Brasil), com o CNPJ no CN.
function criarPfx(senha: string, cnpj = '12345678000190', dias = 365): Buffer {
  const par = forge.pki.rsa.generateKeyPair({ bits: 1024 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = par.publicKey;
  cert.serialNumber = '0a1b2c';
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + dias * 86_400_000);
  const attrs = [{ name: 'commonName', value: `EMPRESA TESTE LTDA:${cnpj}` }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(par.privateKey, forge.md.sha256.create());
  const asn1 = forge.pkcs12.toPkcs12Asn1(par.privateKey, [cert], senha, { algorithm: '3des' });
  return Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary');
}

const chamar = async (metodo: string, caminho: string, corpo?: unknown, token?: string) => {
  const r = await fetch(base + caminho, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: r.status, corpo: (await r.json().catch(() => null)) as any, cache: r.headers.get('cache-control') };
};

before(async () => {
  if (!url) return;
  process.env.HUB_CERT_MASTER_KEY = randomBytes(32).toString('base64');
  db = criarPool(url);
  await db.query('drop schema public cascade; create schema public;');
  await migrar(db);
  await db.query('insert into users (id, email, nome, senha_hash, is_super) values ($1,$2,$3,$4,true)',
    [randomUUID(), 'admin@hub.test', 'Admin', await hashSenha('senha-super-1')]);
  server = criarApp({ db, segredo: 'segredo-de-teste-123456' }).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  delete process.env.HUB_CERT_MASTER_KEY;
  server?.close();
  await db?.end();
});

test('certificados: leitura do .pfx e cifra em envelope (amarrada a empresa)', () => {
  const antes = process.env.HUB_CERT_MASTER_KEY;
  process.env.HUB_CERT_MASTER_KEY = randomBytes(32).toString('base64');
  const pfx = criarPfx('senha-do-cert');
  const m = analisarPfx(pfx, 'senha-do-cert');
  assert.deepEqual([m.cnpj, m.serie, m.titular], ['12345678000190', '0a1b2c', 'EMPRESA TESTE LTDA:12345678000190']);
  assert.ok(m.validoAte.getTime() > Date.now());
  assert.throws(() => analisarPfx(pfx, 'errada'), /Senha do certificado invalida/);
  assert.throws(() => analisarPfx(Buffer.from('isto nao e um pfx'.repeat(20)), 'x'), /nao e um certificado/);

  const c = cifrarCertificado(pfx, 'senha-do-cert', 'tenant-a');
  assert.ok(!c.pfx.includes(pfx.toString('base64').slice(0, 40)) && !c.senha.includes('senha-do-cert'));   // nada em claro
  const volta = decifrarCertificado(c, 'tenant-a');
  assert.deepEqual([volta.pfx.equals(pfx), volta.senha], [true, 'senha-do-cert']);
  assert.throws(() => decifrarCertificado(c, 'tenant-b'));                                                    // outra empresa: falha
  process.env.HUB_CERT_MASTER_KEY = randomBytes(32).toString('base64');
  assert.throws(() => decifrarCertificado(c, 'tenant-a'));                                                    // outra chave-mestra: falha
  if (antes === undefined) delete process.env.HUB_CERT_MASTER_KEY; else process.env.HUB_CERT_MASTER_KEY = antes;
});

test('certificados: envio, validacoes, download pelo terminal, versao, auditoria e remocao', { skip: pula }, async () => {
  const t = (await chamar('POST', '/v1/auth/login', { email: 'admin@hub.test', senha: 'senha-super-1' })).corpo.token as string;
  const tenant = (await chamar('POST', '/v1/tenants', { nome: 'Cliente API', origem: 'api' }, t)).corpo.id as string;
  const tid = (await chamar('POST', `/v1/tenants/${tenant}/terminals`, { nome: 'Caixa 01' }, t)).corpo;
  const pfx = criarPfx('segredo-123');

  assert.deepEqual((await chamar('GET', `/v1/tenants/${tenant}/certificado`, undefined, t)).corpo, { existe: false });
  assert.equal((await chamar('GET', '/v1/terminal/certificado', undefined, tid.token)).corpo.existe, false);

  // validacoes
  const envia = (corpo: object) => chamar('PUT', `/v1/tenants/${tenant}/certificado`, corpo, t);
  const errada = await envia({ pfx: pfx.toString('base64'), senha: 'errada' });
  assert.deepEqual([errada.status, errada.corpo.detalhe.codigo], [422, 'senha_invalida']);
  assert.equal((await envia({ pfx: Buffer.from('x'.repeat(300)).toString('base64'), senha: 'a' })).corpo.detalhe.codigo, 'arquivo_invalido');
  assert.equal((await envia({ pfx: criarPfx('s', '12345678000190', -5).toString('base64'), senha: 's' })).corpo.detalhe.codigo, 'vencido');

  // o CNPJ do certificado precisa ter a mesma raiz do emitente informado nos parametros
  await chamar('PUT', `/v1/tenants/${tenant}/terminals/${tid.id}/config`, { valores: { con_cnpj: '99888777000166' } }, t);
  const outro = await envia({ pfx: pfx.toString('base64'), senha: 'segredo-123' });
  assert.deepEqual([outro.status, outro.corpo.detalhe.codigo], [422, 'cnpj_diferente']);
  await chamar('PUT', `/v1/tenants/${tenant}/terminals/${tid.id}/config`, { valores: { con_cnpj: '12345678000100', con_certsenha: 'texto-puro' } }, t);

  const ok = await envia({ pfx: pfx.toString('base64'), senha: 'segredo-123', nome: 'loja.pfx' });
  assert.equal(ok.status, 201, JSON.stringify(ok.corpo));
  assert.deepEqual([ok.corpo.versao, ok.corpo.cnpj, ok.corpo.serie, ok.corpo.nome], [1, '12345678000190', '0a1b2c', 'loja.pfx']);
  assert.ok(ok.corpo.dias_restantes >= 364);
  assert.equal(ok.corpo.pfx, undefined);                                                          // nada sensivel na resposta

  // no banco nao ha nada em claro
  const linha = (await db.query('select * from certificados where tenant_id = $1', [tenant])).rows[0];
  assert.ok(!JSON.stringify(linha).includes('segredo-123') && !JSON.stringify(linha).includes(pfx.toString('base64').slice(0, 40)));

  // consulta so devolve metadados
  const meta = (await chamar('GET', `/v1/tenants/${tenant}/certificado`, undefined, t)).corpo;
  assert.deepEqual([meta.existe, meta.versao, meta.pfx, meta.senha], [true, 1, undefined, undefined]);

  // o terminal baixa so quando a versao muda; sem cache
  const baixa = await chamar('GET', '/v1/terminal/certificado?versao=0', undefined, tid.token);
  assert.equal(baixa.cache, 'no-store');
  assert.deepEqual([baixa.corpo.mudou, baixa.corpo.senha, baixa.corpo.serie], [true, 'segredo-123', '0a1b2c']);
  assert.ok(Buffer.from(baixa.corpo.pfx, 'base64').equals(pfx));
  const igual = await chamar('GET', '/v1/terminal/certificado?versao=1', undefined, tid.token);
  assert.deepEqual([igual.corpo.mudou, igual.corpo.pfx, igual.corpo.senha], [false, undefined, undefined]);
  assert.equal((await chamar('GET', '/v1/terminal/certificado', undefined, 'tk_invalido')).status, 401);

  // ping avisa a versao; a config do terminal nao leva mais a senha digitada nos parametros
  assert.equal((await chamar('POST', '/v1/terminal/ping', {}, tid.token)).corpo.certificadoVersao, 1);
  const cfg = (await chamar('GET', '/v1/terminal/config', undefined, tid.token)).corpo;
  assert.deepEqual([cfg.valores.con_cnpj, cfg.valores.con_certsenha], ['12345678000100', undefined]);

  // o log de requisicoes nao guarda o arquivo nem a senha
  const logs = JSON.stringify((await db.query("select req_corpo, resp_corpo from request_log where rota like '%certificado%'")).rows);
  assert.ok(!logs.includes('segredo-123') && !logs.includes(baixa.corpo.pfx.slice(0, 40)));

  // trocar o certificado sobe a versao
  const troca = await envia({ pfx: criarPfx('nova-senha').toString('base64'), senha: 'nova-senha' });
  assert.equal(troca.corpo.versao, 2);
  assert.equal((await chamar('GET', '/v1/terminal/certificado?versao=1', undefined, tid.token)).corpo.mudou, true);

  // auditoria
  const ac = (await chamar('GET', `/v1/tenants/${tenant}/certificado/acessos`, undefined, t)).corpo;
  assert.deepEqual(ac.map((a: any) => a.evento).sort(), ['download', 'download', 'envio', 'envio']);
  assert.ok(ac.some((a: any) => a.evento === 'download' && a.terminal === 'Caixa 01'));

  // prontidao enxerga o certificado
  const pr = (await chamar('GET', `/v1/tenants/${tenant}/prontidao`, undefined, t)).corpo.itens.find((i: any) => i.id === 'certificado');
  assert.equal(pr.ok, true);

  // remover: o terminal volta a ver "sem certificado"
  assert.equal((await chamar('DELETE', `/v1/tenants/${tenant}/certificado`, undefined, t)).status, 200);
  assert.equal((await chamar('GET', '/v1/terminal/certificado', undefined, tid.token)).corpo.existe, false);
  assert.equal((await chamar('DELETE', `/v1/tenants/${tenant}/certificado`, undefined, t)).status, 404);
});

test('certificados: sem chave-mestra o Hub nao guarda nada', { skip: pula }, async () => {
  const guardada = process.env.HUB_CERT_MASTER_KEY;
  delete process.env.HUB_CERT_MASTER_KEY;
  delete process.env.HUB_CERT_KEY_FILE;
  const t = (await chamar('POST', '/v1/auth/login', { email: 'admin@hub.test', senha: 'senha-super-1' })).corpo.token as string;
  const tenant = (await chamar('POST', '/v1/tenants', { nome: 'Sem chave', origem: 'api' }, t)).corpo.id as string;
  const r = await chamar('PUT', `/v1/tenants/${tenant}/certificado`, { pfx: criarPfx('abc').toString('base64'), senha: 'abc' }, t);
  assert.deepEqual([r.status, r.corpo.detalhe.codigo], [503, 'chave_mestra_ausente']);
  assert.equal((await db.query('select count(*)::int as n from certificados where tenant_id = $1', [tenant])).rows[0].n, 0);
  process.env.HUB_CERT_MASTER_KEY = guardada;
});
