import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import http, { type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { criarPool, type Db } from './db.js';
import { migrar } from './migrate.js';
import { criarApp } from './app.js';
import { hashSenha } from './senha.js';
import { assinar, validarUrl } from './webhooks.js';

// Precisa de um Postgres de teste: HUB_TEST_DATABASE_URL (banco descartavel).
const url = process.env.HUB_TEST_DATABASE_URL;
const pula = url ? false : 'defina HUB_TEST_DATABASE_URL';

let db: Db;
let server: Server;
let alvo: Server;
let base = '';
let alvoUrl = '';
let respostaAlvo = 200;
const recebidos: { headers: http.IncomingHttpHeaders; corpo: string }[] = [];

const chamar = async (metodo: string, caminho: string, corpo?: unknown, token?: string) => {
  const r = await fetch(base + caminho, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: r.status, corpo: (await r.json().catch(() => null)) as any };
};
const esperar = async (cond: () => boolean | Promise<boolean>, ms = 4000) => {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { if (await cond()) return; await new Promise((r) => setTimeout(r, 50)); }
  throw new Error('tempo esgotado esperando a condicao');
};

before(async () => {
  if (!url) return;
  process.env.HUB_WEBHOOK_REDE_INTERNA = 'sim';
  alvo = http.createServer((req, res) => {
    let corpo = '';
    req.on('data', (c) => { corpo += c; });
    req.on('end', () => { recebidos.push({ headers: req.headers, corpo }); res.writeHead(respostaAlvo); res.end('recebido'); });
  }).listen(0);
  alvoUrl = `http://127.0.0.1:${(alvo.address() as AddressInfo).port}/hook`;
  db = criarPool(url);
  await db.query('drop schema public cascade; create schema public;');
  await migrar(db);
  await db.query('insert into users (id, email, nome, senha_hash, is_super) values ($1,$2,$3,$4,true)',
    [randomUUID(), 'admin@hub.test', 'Admin', await hashSenha('senha-super-1')]);
  server = criarApp({ db, segredo: 'segredo-de-teste-123456' }).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  delete process.env.HUB_WEBHOOK_REDE_INTERNA;
  server?.close();
  alvo?.close();
  await db?.end();
});

test('validarUrl: https obrigatorio, sem credenciais (http so com rede interna liberada)', () => {
  const antes = process.env.HUB_WEBHOOK_REDE_INTERNA;
  delete process.env.HUB_WEBHOOK_REDE_INTERNA;
  assert.equal(validarUrl('https://cliente.exemplo.com/hook'), null);
  assert.match(validarUrl('http://cliente.exemplo.com/hook')!, /https/);
  assert.match(validarUrl('https://u:p@cliente.exemplo.com/')!, /usuario e senha/);
  assert.equal(validarUrl('nao e url'), 'URL invalida.');
  process.env.HUB_WEBHOOK_REDE_INTERNA = 'sim';
  assert.equal(validarUrl('http://127.0.0.1:9/x'), null);
  if (antes === undefined) delete process.env.HUB_WEBHOOK_REDE_INTERNA; else process.env.HUB_WEBHOOK_REDE_INTERNA = antes;
});

test('webhooks: cadastro, disparo assinado, filtro de eventos, falha, reenvio, teste e segredo', { skip: pula }, async () => {
  const tAdm = (await chamar('POST', '/v1/auth/login', { email: 'admin@hub.test', senha: 'senha-super-1' })).corpo.token as string;
  const agro = (await chamar('POST', '/v1/tenants', { nome: 'Agrosys', origem: 'agrosys', padroes: { con_sincurl: 'http://erp.test:9080', emp_empresa: 1, uni_unidade: 1, fil_filial: 1 } }, tAdm)).corpo.id as string;
  const tenant = (await chamar('POST', '/v1/tenants', { nome: 'Cliente API', origem: 'api' }, tAdm)).corpo.id as string;
  const token = (await chamar('POST', `/v1/tenants/${tenant}/terminals`, { nome: 'Caixa 01' }, tAdm)).corpo.token as string;

  // so origem API; URL e evento validados
  assert.equal((await chamar('POST', `/v1/tenants/${agro}/webhooks`, { nome: 'x', url: alvoUrl }, tAdm)).status, 409);
  assert.equal((await chamar('POST', `/v1/tenants/${tenant}/webhooks`, { nome: 'x', url: 'ftp://x' }, tAdm)).status, 422);
  assert.equal((await chamar('POST', `/v1/tenants/${tenant}/webhooks`, { nome: 'x', url: alvoUrl, eventos: ['venda'] }, tAdm)).status, 400);

  const hook = await chamar('POST', `/v1/tenants/${tenant}/webhooks`, { nome: 'ERP', url: alvoUrl, eventos: ['nota'] }, tAdm);
  assert.equal(hook.status, 201, JSON.stringify(hook.corpo));
  const { id: wid, segredo } = hook.corpo as { id: string; segredo: string };
  assert.match(segredo, /^whsec_/);
  const lista = await chamar('GET', `/v1/tenants/${tenant}/webhooks`, undefined, tAdm);
  assert.deepEqual(lista.corpo.eventos, ['nota', 'movimento-caixa', 'email']);
  assert.equal(lista.corpo.webhooks[0].segredo, undefined);          // o segredo nao volta na listagem
  assert.equal(lista.corpo.webhooks[0].segredo_prefixo, segredo.slice(0, 11));

  // nota: o terminal devolve ao Hub -> o webhook dispara, assinado, e confirma o envio
  const payload = { ds: { 'tt-nfscapa': [{ nfs_numero: 77 }] } };
  const env = await chamar('POST', '/v1/terminal/envios/nota', { chave: 'nota-77', payload }, token);
  assert.ok([200, 202].includes(env.status));
  await esperar(() => recebidos.length === 1);
  const [rec] = recebidos;
  const corpo = JSON.parse(rec.corpo);
  assert.equal(rec.headers['x-hub-event'], 'nota');
  assert.equal(rec.headers['x-hub-signature'], assinar(segredo, rec.headers['x-hub-timestamp'] as string, rec.corpo));
  assert.equal(rec.headers['x-hub-delivery'], corpo.id);
  assert.deepEqual([corpo.evento, corpo.empresa.nome, corpo.terminal.nome, corpo.chave], ['nota', 'Cliente API', 'Caixa 01', 'nota-77']);
  assert.deepEqual(corpo.dados, payload);
  await esperar(async () => (await db.query("select status from outbox where chave = 'nota-77'")).rows[0].status === 'enviado');   // 2xx = ack

  // evento fora da assinatura nao dispara
  await chamar('POST', '/v1/terminal/envios/email', { chave: 'mail-1', payload: { serie: '1', numero: 1, usuario: 'x', destino: 'a@b.c' } }, token);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(recebidos.length, 1);

  // falha do destino: fica pendente com nova tentativa; depois do conserto o reenvio entrega
  respostaAlvo = 500;
  await chamar('POST', '/v1/terminal/envios/nota', { chave: 'nota-78', payload }, token);
  await esperar(async () => (await db.query("select tentativas from webhook_entregas order by id desc limit 1")).rows[0].tentativas === 1);
  const ent = (await chamar('GET', `/v1/tenants/${tenant}/webhooks/entregas?status=pendente`, undefined, tAdm)).corpo;
  assert.equal(ent.length, 1);
  assert.equal(ent[0].erro, 'HTTP 500');
  assert.equal((await db.query("select status from outbox where chave = 'nota-78'")).rows[0].status, 'pendente');   // nao confirmou
  respostaAlvo = 200;
  const re = await chamar('POST', `/v1/tenants/${tenant}/webhooks/entregas/${ent[0].id}/reenviar`, {}, tAdm);
  assert.equal(re.corpo.ok, true);
  const det = await chamar('GET', `/v1/tenants/${tenant}/webhooks/entregas/${ent[0].id}`, undefined, tAdm);
  assert.deepEqual([det.corpo.status, det.corpo.codigo_http, det.corpo.corpo.chave], ['enviado', 200, 'nota-78']);

  // teste (ping) e segredo novo: o anterior deixa de assinar
  const ping = await chamar('POST', `/v1/tenants/${tenant}/webhooks/${wid}/testar`, {}, tAdm);
  assert.equal(ping.corpo.ok, true);
  assert.equal(recebidos.at(-1)!.headers['x-hub-event'], 'ping');
  const novo = (await chamar('POST', `/v1/tenants/${tenant}/webhooks/${wid}/segredo`, {}, tAdm)).corpo.segredo as string;
  assert.notEqual(novo, segredo);
  await chamar('POST', `/v1/tenants/${tenant}/webhooks/${wid}/testar`, {}, tAdm);
  const ultimo = recebidos.at(-1)!;
  assert.equal(ultimo.headers['x-hub-signature'], assinar(novo, ultimo.headers['x-hub-timestamp'] as string, ultimo.corpo));

  // desativado nao dispara; destino em rede interna e bloqueado quando nao liberado
  await chamar('PATCH', `/v1/tenants/${tenant}/webhooks/${wid}`, { ativo: false }, tAdm);
  const antes = recebidos.length;
  await chamar('POST', '/v1/terminal/envios/nota', { chave: 'nota-79', payload }, token);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(recebidos.length, antes);
  await chamar('PATCH', `/v1/tenants/${tenant}/webhooks/${wid}`, { ativo: true, url: 'https://127.0.0.1:1/x' }, tAdm);
  delete process.env.HUB_WEBHOOK_REDE_INTERNA;
  const bloq = await chamar('POST', `/v1/tenants/${tenant}/webhooks/${wid}/testar`, {}, tAdm);
  process.env.HUB_WEBHOOK_REDE_INTERNA = 'sim';
  assert.deepEqual([bloq.corpo.ok, bloq.corpo.erro], [false, 'Destino em rede interna nao permitido.']);

  // remover
  assert.equal((await chamar('DELETE', `/v1/tenants/${tenant}/webhooks/${wid}`, undefined, tAdm)).status, 200);
  assert.equal((await chamar('GET', `/v1/tenants/${tenant}/webhooks`, undefined, tAdm)).corpo.webhooks.length, 0);
});
