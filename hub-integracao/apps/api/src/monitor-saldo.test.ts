import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { criarPool, type Db } from './db.js';
import { migrar } from './migrate.js';
import { criarApp } from './app.js';
import { hashSenha } from './senha.js';
import { gruposDeSaldo, monitorarSaldo } from './monitor-saldo.js';

// Monitor de saldo contra um Agrosys de mentira. Precisa de HUB_TEST_DATABASE_URL.
const url = process.env.HUB_TEST_DATABASE_URL;
const pula = url ? false : 'defina HUB_TEST_DATABASE_URL';

const pedidos: Record<string, any>[] = [];
const saldosErp: Record<number, number> = {};
let agrosys: http.Server;
let hub: http.Server;
let db: Db;
let base = '';
let urlAgrosys = '';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const un = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

const chamar = async (metodo: string, caminho: string, corpo?: unknown, token?: string) => {
  const r = await fetch(base + caminho, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: r.status, corpo: (await r.json().catch(() => null)) as any };
};

before(async () => {
  if (!url) return;
  agrosys = http.createServer((req, res) => {
    let corpo = '';
    req.on('data', (c) => (corpo += c));
    req.on('end', () => {
      const param = un(corpo.match(/<vdadosParam>([\s\S]*?)<\/vdadosParam>/)?.[1] ?? '{}');
      const item = (JSON.parse(param)['tp-param'] ?? [{}])[0];
      pedidos.push(item);
      const pro = Number(item['pro-codigo']);
      const r = item['tip-operacao'] === 'PDVSALDO'
        ? { 'tp-retorno': [{ 'msg-codigo': 1, 'msg-descricao': 'ok', 'msg-retorno': [{ 'tp-saldo': [{ pro_codigo: pro, sal_item: saldosErp[pro] }] }] }] }
        : { 'tp-retorno': [{ 'msg-codigo': 9, 'msg-descricao': 'operacao desconhecida' }] };
      res.setHeader('content-type', 'text/xml');
      res.end(`<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><wsagroServer01Response xmlns="urn:progress-org:Agrosys:wsagro">` +
        `<vdadosRetorno>${esc(JSON.stringify(r))}</vdadosRetorno></wsagroServer01Response></s:Body></s:Envelope>`);
    });
  }).listen(0);
  urlAgrosys = `http://127.0.0.1:${(agrosys.address() as AddressInfo).port}`;

  db = criarPool(url);
  await db.query('drop schema public cascade; create schema public;');
  await migrar(db);
  await db.query('insert into users (id, email, nome, senha_hash, is_super) values ($1,$2,$3,$4,true)',
    [randomUUID(), 'admin@hub.test', 'Admin', await hashSenha('senha-super-1')]);
  hub = criarApp({ db, segredo: 'segredo-de-teste-123456' }).listen(0);
  base = `http://127.0.0.1:${(hub.address() as AddressInfo).port}`;
});

after(async () => {
  agrosys?.close();
  hub?.close();
  await db?.end();
});

test('monitor de saldo: grupos por empresa/unidade/filial e consulta so de produtos ativos abaixo do minimo', { skip: pula }, async () => {
  const adm = (await chamar('POST', '/v1/auth/login', { email: 'admin@hub.test', senha: 'senha-super-1' })).corpo.token as string;
  const emp = (await chamar('POST', '/v1/tenants', {
    nome: 'Loja', origem: 'agrosys',
    padroes: { con_sincurl: urlAgrosys, emp_empresa: 1, uni_unidade: 2, fil_filial: 3, cai_timeout: 5000 },
  }, adm)).corpo.id as string;
  const novo = async (nome: string, valores: Record<string, unknown>) => {
    const t = (await chamar('POST', `/v1/tenants/${emp}/terminals`, { nome }, adm)).corpo;
    if (Object.keys(valores).length) await chamar('PUT', `/v1/tenants/${emp}/terminals/${t.id}/config`, { valores }, adm);
    return t.id as string;
  };

  // sem parametros: ninguem participa
  await novo('Caixa 01', {});
  assert.deepEqual(await gruposDeSaldo(db), []);

  // intervalo menor que 5 s ou saldo minimo 0: nao participa
  await novo('Caixa 02', { cai_saldomin: 10, cai_saldointervalo: 4 });
  await novo('Caixa 03', { cai_saldomin: 0, cai_saldointervalo: 30 });
  assert.deepEqual(await gruposDeSaldo(db), []);

  // dois terminais da mesma empresa/unidade/filial viram UM grupo (maior minimo, menor intervalo)
  await novo('Caixa 04', { cai_saldomin: 10, cai_saldointervalo: 30 });
  await novo('Caixa 05', { cai_saldomin: 20, cai_saldointervalo: 5 });
  const g1 = await gruposDeSaldo(db);
  assert.equal(g1.length, 1);
  assert.deepEqual([g1[0].terminais, g1[0].saldoMin, g1[0].intervaloSeg, g1[0].ignorado], [2, 20, 5, undefined]);

  // saldos e cadastros no Hub: 1 abaixo/ativo, 2 abaixo/inativo, 3 folgado, 4 abaixo/sem cadastro, 5 abaixo/excluido
  const grava = (entidade: string, chave: string, dados: object, excluido = false) => db.query(
    `insert into sync_rows (tenant_id, entidade, chave, dados, hash, id, excluido) values ($1,$2,$3,$4,$5,$6,$7)`,
    [emp, entidade, chave, JSON.stringify(dados), randomUUID(), randomUUID(), excluido]);
  const saldo = (p: number, v: number) => grava('stock-balance', String(p), { pro_codigo: p, sal_item: v });
  await saldo(1, 5); await saldo(2, 5); await saldo(3, 500); await saldo(4, 0); await saldo(5, 1);
  await grava('products', '1', { pro_codigo: 1, pro_ativo: 'yes' });
  await grava('products', '2', { pro_codigo: 2, pro_ativo: 'no' });
  await grava('products', '3', { pro_codigo: 3, pro_ativo: 'yes' });
  await grava('products', '5', { pro_codigo: 5, pro_ativo: 'yes' }, true);
  saldosErp[1] = 4; saldosErp[4] = 9;

  pedidos.length = 0;
  const r = await monitorarSaldo(db, g1[0]);
  assert.deepEqual([r.consultados, r.atualizados, r.recusados, r.erro], [2, 2, 0, undefined]);
  assert.deepEqual(pedidos.map((p) => p['pro-codigo']).sort(), [1, 4]);        // 2 inativo, 3 folgado, 5 excluido: nao consulta
  assert.deepEqual([pedidos[0]['emp-empresa'], pedidos[0]['uni-unidade'], pedidos[0]['fil-filial']], [1, 2, 3]);

  // o saldo novo ficou no Hub e chega aos terminais pela sincronizacao
  const lido = await db.query("select chave, dados->>'sal_item' as s from sync_rows where tenant_id = $1 and entidade = 'stock-balance' order by chave", [emp]);
  assert.deepEqual(lido.rows.map((x: any) => [x.chave, x.s]), [['1', '4'], ['2', '5'], ['3', '500'], ['4', '9'], ['5', '1']]);

  // sem mudanca no ERP: consulta de novo mas nao reescreve
  const r2 = await monitorarSaldo(db, g1[0]);
  assert.deepEqual([r2.consultados, r2.atualizados], [2, 0]);

  // outra filial na mesma empresa: so o escopo padrao e monitorado
  await novo('Caixa 06', { cai_saldomin: 10, cai_saldointervalo: 30, fil_filial: 9 });
  const g2 = await gruposDeSaldo(db);
  assert.equal(g2.length, 2);
  assert.equal(g2.find((g) => g.filial === 3)!.ignorado, undefined);
  assert.match(g2.find((g) => g.filial === 9)!.ignorado!, /unico por empresa/);
});
