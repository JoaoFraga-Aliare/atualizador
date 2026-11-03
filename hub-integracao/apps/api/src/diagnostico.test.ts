import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { criarPool, type Db } from './db.js';
import { migrar } from './migrate.js';
import { criarApp } from './app.js';
import { hashSenha } from './senha.js';
import { diagnosticar, resumo } from './diagnostico.js';

// O diagnostico do piloto: roda contra um Hub de verdade e aponta o que falta. Precisa de HUB_TEST_DATABASE_URL.
const url = process.env.HUB_TEST_DATABASE_URL;
const pula = url ? false : 'defina HUB_TEST_DATABASE_URL';
let db: Db;
let server: Server;
let base = '';

before(async () => {
  if (!url) return;
  process.env.HUB_RATE_401_MAX = '100000';
  db = criarPool(url);
  await db.query('drop schema public cascade; create schema public;');
  await migrar(db);
  await db.query('insert into users (id, email, nome, senha_hash, is_super) values ($1,$2,$3,$4,true)', [randomUUID(), 'admin@diag.test', 'Admin', await hashSenha('senha-super-1')]);
  server = criarApp({ db, segredo: 'segredo-de-teste-diag-123456' }).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { server?.close(); await db?.end(); });

const chamar = async (metodo: string, caminho: string, corpo?: unknown, token?: string) => {
  const r = await fetch(base + caminho, { method: metodo, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return (await r.json().catch(() => null)) as any;
};
const achar = (r: { item: string; nivel: string; detalhe: string }[], item: string) => r.find((x) => x.item === item);

test('diagnostico: Hub fora do ar, login recusado e uma empresa recem-criada (falta quase tudo)', { skip: pula }, async () => {
  const fora = await diagnosticar({ url: 'http://127.0.0.1:9' });
  assert.deepEqual([fora.length, fora[0].nivel, fora[0].item], [1, 'falha', 'Hub no ar']);

  const ruim = await diagnosticar({ url: base, email: 'admin@diag.test', senha: 'errada-errada-1' });
  assert.equal(achar(ruim, 'Login')!.nivel, 'falha');

  const token = (await chamar('POST', '/v1/auth/login', { email: 'admin@diag.test', senha: 'senha-super-1' })).token as string;
  const tenant = (await chamar('POST', '/v1/tenants', { nome: 'Loja Piloto', origem: 'api' }, token)).id as string;
  const term = await chamar('POST', `/v1/tenants/${tenant}/terminals`, { nome: 'Caixa 01', ambiente: 'homologacao' }, token);

  const r = await diagnosticar({ url: base, email: 'admin@diag.test', senha: 'senha-super-1', empresa: 'Loja Piloto', terminalToken: term.token });
  assert.equal(achar(r, 'Hub no ar')!.nivel, 'ok');
  assert.equal(achar(r, 'Login')!.nivel, 'ok');
  assert.match(achar(r, 'Empresa')!.detalhe, /Loja Piloto \(origem API\)/);
  assert.equal(achar(r, 'Terminal Caixa 01')!.nivel, 'atencao', 'nunca conectou');
  assert.equal(achar(r, 'Pre-requisitos de venda')!.nivel, 'falha');
  assert.match(achar(r, 'Pre-requisitos de venda')!.detalhe, /Faltam \d+ de \d+/);
  assert.equal(achar(r, 'Certificado digital')!.nivel, 'falha');
  assert.match(achar(r, 'Token do terminal')!.detalhe, /Caixa 01 - Loja Piloto - HOMOLOGACAO/);
  assert.equal(achar(r, 'Ambiente da nota (con_tpamb)')!.nivel, 'ok');
  assert.equal(achar(r, 'Parametros fiscais do caixa')!.nivel, 'falha');
  assert.equal(achar(r, 'Sync products')!.nivel, 'falha', 'sem produtos para o caixa');
  assert.equal(achar(r, 'Alertas do Hub')!.nivel, 'ok');
  assert.ok(resumo(r).falha >= 4);

  // token errado
  const t2 = await diagnosticar({ url: base, terminalToken: 'tk_invalido' });
  assert.equal(achar(t2, 'Token do terminal')!.nivel, 'falha');
  assert.equal(achar(t2, 'Gerencial')!.nivel, 'atencao');

  // depois de cadastrar o que falta, os itens passam (exemplo: parametros fiscais e produto pronto)
  await chamar('PUT', `/v1/tenants/${tenant}/terminals/${term.id}/config`, { valores: { con_cnpj: '12345678000190', con_razsoc: 'LOJA', con_serienfc: '1', con_csc: 'ABC', con_idcsc: '1', tip_operacao: 1, cai_consufinal: 1 } }, token);
  const r2 = await diagnosticar({ url: base, email: 'admin@diag.test', senha: 'senha-super-1', empresa: tenant, terminalToken: term.token });
  assert.equal(achar(r2, 'Parametros fiscais do caixa')!.nivel, 'ok');
  assert.equal(achar(r2, 'Empresa')!.nivel, 'ok', 'tambem acha a empresa pelo id');
});
