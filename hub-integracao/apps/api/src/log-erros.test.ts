import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { criarPool, type Db } from './db.js';
import { migrar } from './migrate.js';
import { criarApp } from './app.js';
import { hashSenha } from './senha.js';

// Log so de erros: requisicao que deu certo nao vira linha no request_log, mas continua contada (conexao, resumo, consumo).
// Precisa de HUB_TEST_DATABASE_URL (banco descartavel).
const url = process.env.HUB_TEST_DATABASE_URL;
const pula = url ? false : 'defina HUB_TEST_DATABASE_URL';
let db: Db;
let server: Server;
let base = '';

const chamar = async (metodo: string, caminho: string, corpo?: unknown, token?: string) => {
  const r = await fetch(base + caminho, { method: metodo, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, corpo: (await r.json().catch(() => null)) as any };
};
const espera = () => new Promise((r) => setTimeout(r, 300));       // o log e gravado depois da resposta

before(async () => {
  if (!url) return;
  process.env.HUB_RATE_401_MAX = '100000';
  db = criarPool(url);
  await db.query('drop schema public cascade; create schema public;');
  await migrar(db);
  await db.query('insert into users (id, email, nome, senha_hash, is_super) values ($1,$2,$3,$4,true)', [randomUUID(), 'admin@le.test', 'Admin', await hashSenha('senha-super-1')]);
  server = criarApp({ db, segredo: 'segredo-de-teste-logerros-123456' }).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { server?.close(); await db?.end(); });

test('log so de erros: sucesso vira contador, erro vira linha completa, e o liga/desliga de depuracao funciona', { skip: pula }, async () => {
  const t = (await chamar('POST', '/v1/auth/login', { email: 'admin@le.test', senha: 'senha-super-1' })).corpo.token as string;
  const A = (await chamar('POST', '/v1/tenants', { nome: 'Loja', origem: 'api' }, t)).corpo.id as string;
  const term = (await chamar('POST', `/v1/tenants/${A}/terminals`, { nome: 'Caixa 01' }, t)).corpo as { id: string; token: string };
  const chave = (await chamar('POST', `/v1/tenants/${A}/api-keys`, { nome: 'ERP' }, t)).corpo.chave as string;
  const logs = async () => (await db.query('select rota, resultado from request_log where tenant_id = $1 order by id', [A])).rows;

  assert.equal((await chamar('GET', '/v1/admin/logs/config', undefined, t)).corpo.gravarSucesso, false, 'padrao: so erros');

  // 20 consultas que deram certo: nenhuma linha no log; tudo nos contadores
  for (let i = 0; i < 20; i++) assert.equal((await chamar('GET', '/v1/sync/brands?desde=0', undefined, term.token)).status, 200);
  assert.equal((await chamar('POST', '/v1/brand', { codigo: 1, descricao: 'Marca' }, chave)).status, 200);
  await espera();
  assert.deepEqual(await logs(), [], 'sucesso nao grava linha');
  const c = (await db.query("select sum(ok)::int as ok, sum(erros + recusados)::int as ruins, sum(bytes_out)::int as saida from trafego_hora where tenant_id = $1 and canal = 'terminal->hub'", [A])).rows[0];
  assert.deepEqual([c.ok, c.ruins, c.saida > 0], [20, 0, true]);

  // erro e recusa viram linha (com conteudo para depurar); o contador acompanha
  assert.equal((await chamar('POST', '/v1/brand', { codigo: 'nao-e-numero' }, chave)).status, 422);
  assert.equal((await chamar('GET', '/v1/sync/inexistente?desde=0', undefined, term.token)).status >= 400, true);
  await espera();
  const ruins = await logs();
  assert.ok(ruins.length >= 1 && ruins.every((x: any) => x.resultado !== 'ok'), JSON.stringify(ruins));
  assert.ok(ruins.some((x: any) => x.rota === '/v1/brand'));

  // tela de conexao continua mostrando requisicoes, erros e a ultima busca do terminal (vindos dos contadores)
  const con = (await chamar('GET', `/v1/tenants/${A}/conexao`, undefined, t)).corpo;
  const x = con.terminais[0];
  assert.ok(x.requisicoes_24h >= 20 && x.erros_24h >= 1, JSON.stringify(x));
  assert.equal(x.ultima_busca.operacao, 'inexistente');            // a ultima busca (mesmo com erro) e a que aparece
  assert.notEqual(x.ultima_busca.resultado, 'ok');
  // resumo do administrador tambem
  const resumo = (await chamar('GET', '/v1/resumo', undefined, t)).corpo;
  assert.ok(resumo.pdv.requisicoes >= 20 && resumo.pdv.erros >= 1);

  // depuracao: ligar grava tambem o que deu certo; desligar volta ao normal
  assert.equal((await chamar('PUT', '/v1/admin/logs/config', { gravarSucesso: true }, t)).corpo.gravarSucesso, true);
  assert.equal((await chamar('GET', '/v1/sync/brands?desde=0', undefined, term.token)).status, 200);
  await espera();
  assert.ok((await logs()).some((l: any) => l.resultado === 'ok'), 'com a depuracao ligada o sucesso e gravado');
  await chamar('PUT', '/v1/admin/logs/config', { gravarSucesso: false }, t);
  const antes = (await logs()).length;
  await chamar('GET', '/v1/sync/brands?desde=0', undefined, term.token);
  await espera();
  assert.equal((await logs()).length, antes);

  // o ping nao entra no log e nao pesa
  await chamar('POST', '/v1/terminal/ping', {}, term.token);
  assert.equal((await logs()).length, antes);
});
