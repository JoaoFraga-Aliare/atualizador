import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { criarPool, type Db } from './db.js';
import { migrar } from './migrate.js';
import { criarApp } from './app.js';
import { hashSenha } from './senha.js';

// A collection do Postman (docs/hub/postman) tem que bater com a API: toda requisicao aponta para uma rota que existe,
// com o metodo certo, e leva Referer: postman. Regerar com `npm run postman` (na raiz do hub).
const url = process.env.HUB_TEST_DATABASE_URL;
const pula = url ? false : 'defina HUB_TEST_DATABASE_URL';
const arquivo = new URL('../../../docs/hub/postman/Hub-API.postman_collection.json', import.meta.url);

let db: Db;
let server: Server;
let base = '';

before(async () => {
  if (!url) return;
  process.env.HUB_RATE_401_MAX = '100000';   // o teste faz centenas de chamadas com token invalido de proposito
  db = criarPool(url);
  await db.query('drop schema public cascade; create schema public;');
  await migrar(db);
  await db.query('insert into users (id, email, nome, senha_hash, is_super) values ($1,$2,$3,$4,true)', [randomUUID(), 'admin@pm.test', 'Admin', await hashSenha('senha-super-1')]);
  server = criarApp({ db, segredo: 'segredo-de-teste-postman-123456' }).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { server?.close(); await db?.end(); });

type Req = { name: string; request: { method: string; header: { key: string; value: string }[]; url: { raw: string }; body?: { raw: string } } };
const achatar = (itens: any[]): Req[] => itens.flatMap((i) => (i.item ? achatar(i.item) : [i as Req]));

test('collection do Postman: toda requisicao existe na API e se identifica como Postman', { skip: pula }, async () => {
  const colecao = JSON.parse(readFileSync(arquivo, 'utf8'));
  const todas = achatar(colecao.item);
  assert.ok(todas.length > 200, `${todas.length} requisicoes`);

  // o cabecalho tambem vale para quem criar uma requisicao nova na collection
  assert.match(JSON.stringify(colecao.event), /Referer.*postman/);
  assert.match(colecao.info.description, /Referer: postman/);

  const valores: Record<string, string> = {
    baseUrl: base, entidade: 'brands', operacao: 'PDVVERSAO', cidadeCodigo: '1', entregaId: '1', outboxId: '1', logId: '1', envioId: '1',
  };
  const preencher = (texto: string) => texto.replace(/\{\{(\w+)\}\}/g, (_m, nome) => valores[nome] ?? randomUUID());
  const sem404: string[] = [];
  const vistas = new Set<string>();

  for (const r of todas) {
    const cab = Object.fromEntries(r.request.header.map((h) => [h.key.toLowerCase(), h.value]));
    assert.equal(cab.referer, 'postman', `${r.name}: sem Referer: postman`);
    if (r.request.body) JSON.parse(r.request.body.raw);        // corpo e um JSON valido

    const endereco = preencher(r.request.url.raw);
    const chave = `${r.request.method} ${endereco.replace(base, '').split('?')[0]}`;
    assert.ok(!vistas.has(`${r.name}|${chave}`), `duplicada: ${r.name}`);
    vistas.add(`${r.name}|${chave}`);

    const resp = await fetch(endereco, {
      method: r.request.method,
      headers: { 'content-type': 'application/json', authorization: 'Bearer invalido', referer: 'postman' },
      body: r.request.body && r.request.method !== 'GET' ? preencher(r.request.body.raw) : undefined,
    });
    const tipo = resp.headers.get('content-type') ?? '';
    await resp.text();
    // rota inexistente no Express = 404 em HTML ("Cannot GET /..."); rota existente responde em JSON (401/403/404/422...)
    if (resp.status === 404 && tipo.includes('text/html')) sem404.push(`${r.name}: ${chave}`);
  }
  assert.deepEqual(sem404, [], `requisicoes da collection sem rota na API:\n${sem404.join('\n')}`);
});

test('o Hub entrega a collection e o ambiente (com o baseUrl do painel) so para quem esta logado', { skip: pula }, async () => {
  assert.equal((await fetch(`${base}/v1/postman/collection`)).status, 401);
  assert.equal((await fetch(`${base}/v1/postman/environment`, { headers: { authorization: 'Bearer lixo' } })).status, 401);
  const login = await (await fetch(`${base}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@pm.test', senha: 'senha-super-1' }) })).json() as { token: string };
  const h = { authorization: `Bearer ${login.token}` };
  const col = await (await fetch(`${base}/v1/postman/collection?base=https://hub.exemplo.com/`, { headers: h })).json() as any;
  assert.equal(col.variable.find((v: any) => v.key === 'baseUrl').value, 'https://hub.exemplo.com');
  assert.deepEqual(col, JSON.parse(JSON.stringify(col)));
  assert.equal(achatar(col.item).length, achatar(JSON.parse(readFileSync(arquivo, 'utf8')).item).length, 'mesmo conteudo do arquivo gerado');
  const amb = await (await fetch(`${base}/v1/postman/environment?base=https://hub.exemplo.com`, { headers: h })).json() as any;
  assert.equal(amb.values.find((v: any) => v.key === 'baseUrl').value, 'https://hub.exemplo.com');
  // base invalida (script, esquema estranho) volta ao padrao
  const ruim = await (await fetch(`${base}/v1/postman/environment?base=${encodeURIComponent('javascript:alert(1)')}`, { headers: h })).json() as any;
  assert.equal(ruim.values.find((v: any) => v.key === 'baseUrl').value, 'http://localhost:4000');
});
