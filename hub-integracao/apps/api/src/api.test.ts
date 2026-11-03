import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { criarPool, type Db } from './db.js';
import { migrar } from './migrate.js';
import { criarApp } from './app.js';
import { hashSenha } from './senha.js';

// Precisa de um Postgres de teste: HUB_TEST_DATABASE_URL (banco descartavel).
const url = process.env.HUB_TEST_DATABASE_URL;
const pula = url ? false : 'defina HUB_TEST_DATABASE_URL';

let db: Db;
let server: Server;
let base = '';

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
  db = criarPool(url);
  await db.query('drop schema public cascade; create schema public;');
  await migrar(db);
  await db.query('insert into users (id, email, nome, senha_hash, is_super) values ($1,$2,$3,$4,true)',
    [randomUUID(), 'admin@hub.test', 'Admin', await hashSenha('senha-super-1')]);
  server = criarApp({ db, segredo: 'segredo-de-teste-123456' }).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server?.close();
  await db?.end();
});

test('fluxo completo: tenant, usuario de integracao, terminal, ingestao e sync incremental', { skip: pula }, async () => {
  // login do administrador do Hub
  const adm = await chamar('POST', '/v1/auth/login', { email: 'admin@hub.test', senha: 'senha-super-1' });
  assert.equal(adm.status, 200);
  const tAdm = adm.corpo.token as string;
  assert.equal((await chamar('POST', '/v1/auth/login', { email: 'admin@hub.test', senha: 'errada' })).status, 401);

  // dois tenants
  // origem agrosys exige os padroes de conexao; origem api nao
  const semPadroes = await chamar('POST', '/v1/tenants', { nome: 'Sem padroes', origem: 'agrosys' }, tAdm);
  assert.equal(semPadroes.status, 422);
  const padroesA = { con_sincurl: 'http://erp.cliente-a.test:9080', emp_empresa: 1, uni_unidade: 1, fil_filial: 1, cai_timeout: 8000 };
  const a = (await chamar('POST', '/v1/tenants', { nome: 'Cliente A', origem: 'agrosys', padroes: padroesA }, tAdm)).corpo.id as string;
  const b = (await chamar('POST', '/v1/tenants', { nome: 'Cliente B', origem: 'api' }, tAdm)).corpo.id as string;
  assert.equal((await chamar('GET', `/v1/tenants/${a}`, undefined, tAdm)).corpo.origem, 'agrosys');
  assert.equal((await chamar('GET', `/v1/tenants/${b}`, undefined, tAdm)).corpo.origem, 'api');
  assert.equal((await chamar('POST', '/v1/tenants', { nome: 'Invalida', origem: 'ftp' }, tAdm)).status, 400);
  // padroes de conexao so existem em empresa agrosys
  assert.equal((await chamar('PUT', `/v1/tenants/${b}/padroes`, { padroes: { cai_timeout: 1000 } }, tAdm)).status, 409);

  // usuario de integracao do tenant A so enxerga o A
  const u = await chamar('POST', `/v1/tenants/${a}/users`, { email: 'int@a.test', nome: 'Integracao A', senha: 'senha-integra-1' }, tAdm);
  assert.equal(u.status, 201);
  const tUsr = (await chamar('POST', '/v1/auth/login', { email: 'int@a.test', senha: 'senha-integra-1' })).corpo.token as string;
  const me = await chamar('GET', '/v1/me', undefined, tUsr);
  assert.deepEqual(me.corpo.tenants.map((t: any) => t.id), [a]);
  assert.equal((await chamar('GET', `/v1/tenants/${b}`, undefined, tUsr)).status, 403);
  assert.equal((await chamar('POST', '/v1/tenants', { nome: 'X' }, tUsr)).status, 403);

  // terminal: conecta direto por token (mostrado uma vez; no banco so o hash)
  const t1 = await chamar('POST', `/v1/tenants/${a}/terminals`, { nome: 'Caixa 01', codigoLegado: '1' }, tUsr);
  assert.equal(t1.status, 201);
  const tTerm = t1.corpo.token as string;
  assert.match(tTerm, /^tk_/);
  const guardado = await db.query('select token_hash, token_prefixo from terminals where id = $1', [t1.corpo.id]);
  assert.notEqual(guardado.rows[0].token_hash, tTerm);
  assert.equal(guardado.rows[0].token_prefixo, tTerm.slice(0, 9));
  assert.equal((await chamar('GET', '/v1/sync/products?desde=0', undefined, 'tk_invalido')).status, 401);

  // ingestao: 2 produtos
  const produtos = [{ pro_codigo: 1, pro_descricao: 'Semente' }, { pro_codigo: 2, pro_descricao: 'Adubo' }];
  const i1 = await chamar('POST', `/v1/tenants/${a}/ingest/products`, { linhas: produtos }, tUsr);
  assert.deepEqual([i1.corpo.mudadas, i1.corpo.iguais], [2, 0]);

  // terminal pega tudo na primeira vez
  const s1 = await chamar('GET', '/v1/sync/products?desde=0', undefined, tTerm);
  assert.equal(s1.corpo.mudancas.length, 2);
  const cursor = s1.corpo.seqMax as number;

  // reenviar o mesmo lote nao muda nada (hash igual) e o terminal nao recebe nada
  const i2 = await chamar('POST', `/v1/tenants/${a}/ingest/products`, { linhas: produtos }, tUsr);
  assert.deepEqual([i2.corpo.mudadas, i2.corpo.iguais], [0, 2]);
  assert.equal((await chamar('GET', `/v1/sync/products?desde=${cursor}`, undefined, tTerm)).corpo.mudancas.length, 0);

  // mudar um produto (inclusive espacos/ordem nao contam): so ele chega
  const i3 = await chamar('POST', `/v1/tenants/${a}/ingest/products`,
    { linhas: [{ pro_descricao: ' Semente ', pro_codigo: 1 }, { pro_codigo: 2, pro_descricao: 'Adubo NPK' }] }, tUsr);
  assert.deepEqual([i3.corpo.mudadas, i3.corpo.iguais], [1, 1]);
  const s3 = await chamar('GET', `/v1/sync/products?desde=${cursor}`, undefined, tTerm);
  assert.deepEqual(s3.corpo.mudancas.map((m: any) => m.chave), ['2']);

  // paginacao
  const p = await chamar('GET', '/v1/sync/products?desde=0&limite=1', undefined, tTerm);
  assert.equal(p.corpo.mudancas.length, 1);
  assert.equal(p.corpo.temMais, true);

  // isolamento: o tenant B nao ve nada, e o terminal de A nao le dados de B
  await chamar('POST', `/v1/tenants/${b}/ingest/products`, { linhas: [{ pro_codigo: 99, pro_descricao: 'So do B' }] }, tAdm);
  const sA = await chamar('GET', '/v1/sync/products?desde=0', undefined, tTerm);
  assert.ok(!sA.corpo.mudancas.some((m: any) => m.chave === '99'));

  // validacao do lote: chave ausente recusa o lote inteiro
  const ruim = await chamar('POST', `/v1/tenants/${a}/ingest/products`, { linhas: [{ pro_descricao: 'sem codigo' }] }, tUsr);
  assert.equal(ruim.status, 422);

  // ---- parametros do caixa configurados no Hub ----
  const base1 = await chamar('GET', `/v1/tenants/${a}/terminals/${t1.corpo.id}/config`, undefined, tUsr);
  assert.equal(base1.corpo.versao, 0);
  assert.equal(base1.corpo.efetivo.con_sincurl, padroesA.con_sincurl);       // herda o padrao da empresa
  const c1 = await chamar('PUT', `/v1/tenants/${a}/terminals/${t1.corpo.id}/config`,
    { valores: { cai_loja: ' 01 ', cai_nomeloja: 'Loja Centro', pdv_sincsangriasup: true, cai_timeout: 12000 } }, tUsr);
  assert.deepEqual([c1.status, c1.corpo.versao, c1.corpo.mudou], [200, 1, true]);
  // repetir o mesmo conteudo nao sobe a versao
  const c2 = await chamar('PUT', `/v1/tenants/${a}/terminals/${t1.corpo.id}/config`, { valores: { cai_loja: '01' } }, tUsr);
  assert.deepEqual([c2.corpo.versao, c2.corpo.mudou], [1, false]);
  // validacao: desconhecido, tipo errado, lista fora das opcoes
  const ruimCfg = await chamar('PUT', `/v1/tenants/${a}/terminals/${t1.corpo.id}/config`,
    { valores: { nao_existe: 1, pdv_sincsangriasup: 'sim', con_uf: 'XX' } }, tUsr);
  assert.equal(ruimCfg.status, 422);
  assert.equal(ruimCfg.corpo.detalhe.length, 3);
  // empresa com origem api nao aceita campo so do Agrosys
  const tB = await chamar('POST', `/v1/tenants/${b}/terminals`, { nome: 'Caixa B' }, tAdm);
  assert.equal((await chamar('PUT', `/v1/tenants/${b}/terminals/${tB.corpo.id}/config`, { valores: { con_sincurl: 'http://x' } }, tAdm)).status, 422);
  // usuario do tenant A nao mexe no terminal do B
  assert.equal((await chamar('GET', `/v1/tenants/${b}/terminals/${tB.corpo.id}/config`, undefined, tUsr)).status, 403);
  // o terminal le a propria configuracao (padroes + valores) e so recebe se a versao mudou
  const lido = await chamar('GET', '/v1/terminal/config?desde=0', undefined, tTerm);
  assert.deepEqual([lido.corpo.versao, lido.corpo.mudou], [1, true]);
  assert.equal(lido.corpo.valores.cai_nomeloja, 'Loja Centro');
  assert.equal(lido.corpo.valores.cai_timeout, 12000);            // valor do terminal vence o padrao
  assert.equal(lido.corpo.valores.emp_empresa, 1);                // padrao da empresa
  assert.equal((await chamar('GET', '/v1/terminal/config?desde=1', undefined, tTerm)).corpo.mudou, false);
  // padroes da empresa: alterar sobe a versao e o terminal enxerga na proxima leitura
  assert.equal((await chamar('PUT', `/v1/tenants/${a}/padroes`, { padroes: { fil_filial: 7 } }, tAdm)).status, 200);
  const depois = await chamar('GET', '/v1/terminal/config?desde=1', undefined, tTerm);
  assert.deepEqual([depois.corpo.mudou, depois.corpo.versao, depois.corpo.valores.fil_filial], [true, 2, 7]);

  // novo token invalida o antigo na hora; o novo funciona
  const rs = await chamar('POST', `/v1/tenants/${a}/terminals/${t1.corpo.id}/token`, {}, tUsr);
  assert.equal(rs.status, 200);
  assert.equal((await chamar('GET', '/v1/sync/products?desde=0', undefined, tTerm)).status, 401);
  assert.equal((await chamar('GET', '/v1/sync/products?desde=0', undefined, rs.corpo.token)).status, 200);

  // desativar o terminal derruba o token
  assert.equal((await chamar('POST', `/v1/tenants/${a}/terminals/${t1.corpo.id}/desativar`, {}, tUsr)).status, 200);
  assert.equal((await chamar('GET', '/v1/sync/products?desde=0', undefined, rs.corpo.token)).status, 401);

  // excluir terminal: so quem tem acesso ao tenant; some junto com a configuracao
  assert.equal((await chamar('DELETE', `/v1/tenants/${b}/terminals/${tB.corpo.id}`, undefined, tUsr)).status, 403);
  assert.equal((await chamar('DELETE', `/v1/tenants/${a}/terminals/${tB.corpo.id}`, undefined, tAdm)).status, 404); // id de outro tenant
  assert.equal((await chamar('DELETE', `/v1/tenants/${a}/terminals/${t1.corpo.id}`, undefined, tUsr)).status, 200);
  assert.equal((await chamar('GET', `/v1/tenants/${a}/terminals/${t1.corpo.id}/config`, undefined, tUsr)).status, 404);
  assert.equal((await db.query('select 1 from terminal_settings where terminal_id = $1', [t1.corpo.id])).rowCount, 0);
  assert.equal((await chamar('GET', `/v1/tenants/${a}/terminals`, undefined, tUsr)).corpo.length, 0);
  assert.equal((await chamar('DELETE', `/v1/tenants/${a}/terminals/${t1.corpo.id}`, undefined, tUsr)).status, 404);

  // sem token
  assert.equal((await chamar('GET', '/v1/sync/products')).status, 401);
});

test('catalogo lista entidades com chave', { skip: pula }, async () => {
  const r = await chamar('GET', '/v1/catalog');
  const preco = r.corpo.find((e: any) => e.entidade === 'prices');
  assert.deepEqual(preco.chave, ['pre_tiporeg', 'ite_codigo']);
});
