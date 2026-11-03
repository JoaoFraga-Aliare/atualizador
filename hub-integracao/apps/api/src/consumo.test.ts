import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { criarPool, type Db } from './db.js';
import { migrar } from './migrate.js';
import { criarApp } from './app.js';
import { hashSenha } from './senha.js';
import { relatorioConsumo } from './consumo.js';

// Relatorio de consumo por terminal (base para estimar o peso de um terminal). Precisa de HUB_TEST_DATABASE_URL.
const url = process.env.HUB_TEST_DATABASE_URL;
const pula = url ? false : 'defina HUB_TEST_DATABASE_URL';
let db: Db;
let server: Server;
let base = '';

const chamar = async (metodo: string, caminho: string, corpo?: unknown, token?: string) => {
  const r = await fetch(base + caminho, { method: metodo, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, corpo: (await r.json().catch(() => null)) as any };
};
before(async () => {
  if (!url) return;
  process.env.HUB_RATE_401_MAX = '100000';
  db = criarPool(url);
  await db.query('drop schema public cascade; create schema public;');
  await migrar(db);
  await db.query('insert into users (id, email, nome, senha_hash, is_super) values ($1,$2,$3,$4,true)', [randomUUID(), 'admin@con.test', 'Admin', await hashSenha('senha-super-1')]);
  server = criarApp({ db, segredo: 'segredo-de-teste-consumo-123456' }).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { server?.close(); await db?.end(); });

test('consumo: conta requisicoes, bytes, pings e extrapola para dia e mes', { skip: pula }, async () => {
  const t = (await chamar('POST', '/v1/auth/login', { email: 'admin@con.test', senha: 'senha-super-1' })).corpo.token as string;
  const A = (await chamar('POST', '/v1/tenants', { nome: 'Frigorifico', origem: 'api' }, t)).corpo.id as string;
  const term = (await chamar('POST', `/v1/tenants/${A}/terminals`, { nome: 'Caixa 01' }, t)).corpo as { id: string; token: string };

  // trafego real do terminal: 5 pings (contados por hora), 1 config e 1 sync (entram no log com bytes)
  for (let i = 0; i < 5; i++) assert.equal((await chamar('POST', '/v1/terminal/ping', {}, term.token)).status, 200);
  assert.equal((await chamar('GET', '/v1/terminal/config?desde=0', undefined, term.token)).status, 200);
  assert.equal((await chamar('GET', '/v1/sync/brands?desde=0', undefined, term.token)).status, 200);
  await new Promise((r) => setTimeout(r, 300));            // o log e gravado depois da resposta

  // requisicoes que deram certo nao viram linha no log (so erros); ficam nos contadores por hora, com bytes
  assert.equal((await db.query('select count(*)::int as n from request_log where terminal_id = $1', [term.id])).rows[0].n, 0);
  const linhas = (await db.query("select operacao, ok, bytes_out from trafego_hora where terminal_id = $1 and canal = 'terminal->hub'", [term.id])).rows;
  assert.ok(linhas.length >= 2 && linhas.every((l: any) => Number(l.bytes_out) > 0), JSON.stringify(linhas));
  assert.equal((await db.query('select n from terminal_pings where terminal_id = $1', [term.id])).rows.reduce((s: number, x: any) => s + x.n, 0), 5, 'ping nao entra no log, mas e contado');
  assert.equal((await db.query("select count(*)::int as n from request_log where rota like '%ping'")).rows[0].n, 0);

  const r = await relatorioConsumo(db, 24);
  assert.equal(r.terminais.length, 1);
  const x = r.terminais[0];
  assert.deepEqual([x.terminal, x.empresa, x.pings, x.requisicoes], ['Caixa 01', 'Frigorifico', 5, 2]);
  assert.ok(x.kbSaida > 0 && x.msMedio >= 0);
  assert.ok(r.rotas.some((o) => o.rota === 'config'));
  assert.ok(r.extrapolacao.requisicoesDia > 0 && r.extrapolacao.mbDia >= 0 && r.extrapolacao.bytesPorLinhaDeLog > 0);
  assert.ok(r.banco.tabelas.some((tb) => tb.tabela === 'request_log'));
  // quanto maior a janela, menor a extrapolacao diaria para o mesmo trafego
  const longa = await relatorioConsumo(db, 24 * 30);
  assert.equal(longa.terminais[0].requisicoes, x.requisicoes);
});
