import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { criarPool, type Db } from './db.js';
import { migrar } from './migrate.js';
import { criarApp } from './app.js';
import { hashSenha } from './senha.js';

// Ciclo de vida da sessao: o JWT do usuario nao pode sobreviver a desativacao, rebaixamento ou troca de papel.
// Precisa de HUB_TEST_DATABASE_URL (banco descartavel).
const url = process.env.HUB_TEST_DATABASE_URL;
const pula = url ? false : 'defina HUB_TEST_DATABASE_URL';
const SEGREDO = 'segredo-de-teste-sessao-123456';
const SENHA = 'senha-longa-segura-1';

let db: Db;
let server: Server;
let base = '';

const chamar = async (metodo: string, caminho: string, corpo?: unknown, token?: string, extra: Record<string, string> = {}) => {
  const r = await fetch(base + caminho, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra },
    body: corpo === undefined ? undefined : typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  });
  return { status: r.status, corpo: (await r.json().catch(() => null)) as any };
};

before(async () => {
  if (!url) return;
  process.env.HUB_RATE_401_MAX = '100000';
  process.env.HUB_RATE_CRED_MAX = '100000';
  process.env.HUB_RATE_LOGIN_MAX = '1000';
  process.env.HUB_RATE_LOGIN_IP_MAX = '10000';
  db = criarPool(url);
  await db.query('drop schema public cascade; create schema public;');
  await migrar(db);
  await db.query('insert into users (id, email, nome, senha_hash, is_super) values ($1,$2,$3,$4,true)', [randomUUID(), 'admin@sessao.test', 'Admin', await hashSenha(SENHA)]);
  server = criarApp({ db, segredo: SEGREDO }).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server?.close();
  await db?.end();
});

const entrar = async (email: string) => (await chamar('POST', '/v1/auth/login', { email, senha: SENHA })).corpo.token as string;

test('usuario desativado perde o acesso na hora, mesmo com JWT ainda dentro da validade', { skip: pula }, async () => {
  const admin = await entrar('admin@sessao.test');
  const tenant = (await chamar('POST', '/v1/tenants', { nome: 'Empresa S', origem: 'api' }, admin)).corpo.id;
  await chamar('POST', `/v1/tenants/${tenant}/users`, { email: 'u@sessao.test', nome: 'Usuario S', senha: SENHA, papel: 'tenant_admin' }, admin);
  const jwt = await entrar('u@sessao.test');
  assert.equal((await chamar('GET', `/v1/tenants/${tenant}/terminals`, undefined, jwt)).status, 200);

  await db.query("update users set ativo = false where email = 'u@sessao.test'");
  assert.equal((await chamar('POST', '/v1/auth/login', { email: 'u@sessao.test', senha: SENHA })).status, 401, 'login recusado');
  assert.equal((await chamar('GET', `/v1/tenants/${tenant}/terminals`, undefined, jwt)).status, 401, 'JWT antigo continua valendo');
});

test('super rebaixado deixa de ser super na hora, mesmo com JWT ainda dentro da validade', { skip: pula }, async () => {
  await db.query('insert into users (id, email, nome, senha_hash, is_super) values ($1,$2,$3,$4,true)', [randomUUID(), 'outro@sessao.test', 'Outro', await hashSenha(SENHA)]);
  const jwt = await entrar('outro@sessao.test');
  const tenant = (await chamar('POST', '/v1/tenants', { nome: 'Empresa T', origem: 'api' }, jwt));
  assert.equal(tenant.status, 201 === tenant.status ? 201 : 200, 'super cria empresa');

  await db.query("update users set is_super = false where email = 'outro@sessao.test'");
  const r = await chamar('POST', '/v1/tenants', { nome: 'Empresa U', origem: 'api' }, jwt);
  assert.ok(r.status === 401 || r.status === 403, `rebaixado ainda criou empresa (HTTP ${r.status})`);
});

test('corpo grande so e lido de quem tem credencial valida: Authorization lixo nao ganha o limite de 20 MB', { skip: pula }, async () => {
  const grande = JSON.stringify({ lixo: 'x'.repeat(1024 * 1024) });
  const r = await chamar('POST', '/v1/auth/login', grande, 'lixo');
  assert.equal(r.status, 413, `Authorization invalido ganhou o limite grande (HTTP ${r.status})`);
  const rapido = await chamar('POST', '/v1/auth/login', grande);
  assert.equal(rapido.status, 413, 'anonimo: 1 MB deveria ser 413');
});
