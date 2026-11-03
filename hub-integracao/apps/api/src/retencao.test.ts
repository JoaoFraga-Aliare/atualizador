import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { criarPool, type Db } from './db.js';
import { migrar } from './migrate.js';
import { criarApp } from './app.js';
import { hashSenha } from './senha.js';
import { expurgarDados } from './retencao.js';

// Retencao: o Hub nao acumula historico sem prazo. Precisa de HUB_TEST_DATABASE_URL (banco descartavel).
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
  await db.query('insert into users (id, email, nome, senha_hash, is_super) values ($1,$2,$3,$4,true)', [randomUUID(), 'admin@ret.test', 'Admin', await hashSenha('senha-super-1')]);
  server = criarApp({ db, segredo: 'segredo-de-teste-retencao-123456' }).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { server?.close(); await db?.end(); });

test('retencao: so a versao mais recente do cadastro; historico some no prazo e os prazos sao configuraveis', { skip: pula }, async () => {
  const t = (await chamar('POST', '/v1/auth/login', { email: 'admin@ret.test', senha: 'senha-super-1' })).corpo.token as string;
  const A = (await chamar('POST', '/v1/tenants', { nome: 'Loja', origem: 'api' }, t)).corpo.id as string;
  const chave = (await chamar('POST', `/v1/tenants/${A}/api-keys`, { nome: 'ERP' }, t)).corpo.chave as string;

  // o cadastro nao guarda versoes: reenviar com outro conteudo sobrescreve a mesma linha
  const marca = { codigo: 12, descricao: 'Sementes Boa Safra' };
  for (const descricao of ['v1', 'v2', 'v3']) await chamar('POST', '/v1/brand', { ...marca, descricao }, chave);
  const linhas = (await db.query("select dados from sync_rows where tenant_id = $1 and entidade = 'brands'", [A])).rows;
  assert.equal(linhas.length, 1);
  assert.ok(JSON.stringify(linhas[0].dados).includes('v3') && !JSON.stringify(linhas[0].dados).includes('v1'), 'so a ultima versao');

  const velho = (dias: number) => `now() - interval '${dias} days'`;
  // envios: enviado (5 dias: perde o conteudo; 40 dias: some), pendente (40 dias: fica sempre)
  await db.query(`insert into outbox (tenant_id, tipo, chave, payload, status, atualizado_em, criado_em) values
    ($1,'nota','e5','{"nota":1}','enviado', ${velho(5)}, ${velho(5)}), ($1,'nota','e40','{"nota":2}','enviado', ${velho(40)}, ${velho(40)}),
    ($1,'nota','p40','{"nota":3}','pendente', ${velho(40)}, ${velho(40)}), ($1,'nota','novo','{"nota":4}','enviado', now(), now())`, [A]);
  // entregas de webhook, execucoes de sync, alertas, exclusoes e acessos ao certificado
  const w = (await chamar('POST', `/v1/tenants/${A}/webhooks`, { nome: 'ERP', url: 'https://example.com/h', eventos: ['nota'] }, t)).corpo.id as string;
  await db.query(`insert into webhook_entregas (webhook_id, tenant_id, evento, corpo, status, atualizado_em) values
    ($1,$2,'nota','{}','enviado', ${velho(20)}), ($1,$2,'nota','{}','enviado', ${velho(2)}), ($1,$2,'nota','{}','falhou', ${velho(20)}), ($1,$2,'nota','{}','falhou', ${velho(40)})`, [w, A]);
  await db.query(`insert into sync_runs (tenant_id, entidade, origem, iniciado_em) values ($1,'products','api', ${velho(45)}), ($1,'products','api', ${velho(1)})`, [A]);
  await db.query(`insert into alertas (chave, tipo, titulo, resolvido_em) values ('a:velho','x','velho', ${velho(40)}), ('a:novo','x','novo', ${velho(2)}), ('a:aberto','x','aberto', null)`);
  await db.query(`insert into sync_rows (tenant_id, entidade, chave, dados, hash, id, excluido, atualizado_em) values
    ($1,'brands','x100','{}','h1',$2,true, ${velho(120)}), ($1,'brands','x2','{}','h2',$3,true, ${velho(5)}), ($1,'brands','x3','{}','h3',$4,false, ${velho(300)})`, [A, randomUUID(), randomUUID(), randomUUID()]);

  const r = await expurgarDados(db);
  assert.deepEqual(r, { conteudoEnvios: 1, envios: 1, entregas: 2, execucoes: 1, pings: 0, alertas: 1, acessosCert: 0, exclusoes: 1 });
  const envios = (await db.query("select chave, payload from outbox where tenant_id = $1 order by chave", [A])).rows;
  assert.deepEqual(envios.map((x: any) => x.chave), ['e5', 'novo', 'p40'], 'e40 saiu');
  assert.deepEqual(envios.find((x: any) => x.chave === 'e5').payload, {}, 'enviado ha 5 dias perde o conteudo');
  assert.deepEqual(envios.find((x: any) => x.chave === 'novo').payload, { nota: 4 });
  assert.deepEqual(envios.find((x: any) => x.chave === 'p40').payload, { nota: 3 }, 'pendente nunca perde o conteudo');
  assert.equal((await db.query("select count(*)::int as n from alertas")).rows[0].n, 2);
  assert.deepEqual((await db.query("select chave from sync_rows where chave like 'x%' order by chave")).rows.map((x: any) => x.chave), ['x2', 'x3'], 'exclusao antiga sai; registro vivo e exclusao recente ficam');
  assert.equal((await expurgarDados(db)).envios, 0, 'repetir nao muda nada');

  // prazos configuraveis (e so o administrador altera)
  const cfg = (await chamar('GET', '/v1/admin/logs/config', undefined, t)).corpo;
  assert.deepEqual([cfg.retencao.enviosDias, cfg.retencaoPadrao.exclusoesDias], [30, 90]);
  assert.equal((await chamar('PUT', '/v1/admin/logs/config', { retencao: { enviosDias: 1 } }, t)).status, 422, 'minimo de 3 dias para envios');
  assert.equal((await chamar('PUT', '/v1/admin/logs/config', { retencao: { inventado: 1 } }, t)).status, 422);
  const novo = (await chamar('PUT', '/v1/admin/logs/config', { retencao: { exclusoesDias: 7, enviosDias: 10 } }, t)).corpo;
  assert.deepEqual([novo.retencao.exclusoesDias, novo.retencao.enviosDias, novo.retencao.alertasDias], [7, 10, 30]);
  assert.equal((await expurgarDados(db)).exclusoes, 0, 'a exclusao de 5 dias ainda esta dentro do novo prazo de 7');
});

test('retencao: "limpar agora" pelo administrador e o resto volta ao padrao', { skip: pula }, async () => {
  const t = (await chamar('POST', '/v1/auth/login', { email: 'admin@ret.test', senha: 'senha-super-1' })).corpo.token as string;
  const r = await chamar('POST', '/v1/admin/logs/limpar', { alvo: 'retencao' }, t);
  assert.equal(r.status, 200);
  assert.ok(r.corpo.detalhe && 'envios' in r.corpo.detalhe);
  const volta = (await chamar('PUT', '/v1/admin/logs/config', { retencao: { exclusoesDias: null, enviosDias: null } }, t)).corpo;
  assert.deepEqual([volta.retencao.exclusoesDias, volta.retencao.enviosDias], [90, 30]);
});
