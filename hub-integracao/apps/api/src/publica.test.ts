import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { criarPool, type Db } from './db.js';
import { migrar } from './migrate.js';
import { criarApp } from './app.js';
import { hashSenha } from './senha.js';

// API publica (contrato externo) com chave de API. Precisa de HUB_TEST_DATABASE_URL.
const url = process.env.HUB_TEST_DATABASE_URL;
const pula = url ? false : 'defina HUB_TEST_DATABASE_URL';

let db: Db;
let hub: Server;
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
  await db.query('update log_config set gravar_sucesso = true');   // este teste confere o conteudo do log, inclusive das requisicoes que deram certo
  await db.query('insert into users (id, email, nome, senha_hash, is_super) values ($1,$2,$3,$4,true)',
    [randomUUID(), 'admin@hub.test', 'Admin', await hashSenha('senha-super-1')]);
  hub = criarApp({ db, segredo: 'segredo-de-teste-123456' }).listen(0);
  base = `http://127.0.0.1:${(hub.address() as AddressInfo).port}`;
});

after(async () => { hub?.close(); await db?.end(); });

test('API publica: contrato externo com nomes simples, chave de API e traducao para o terminal', { skip: pula }, async () => {
  const tAdm = (await chamar('POST', '/v1/auth/login', { email: 'admin@hub.test', senha: 'senha-super-1' })).corpo.token as string;
  const emp = (await chamar('POST', '/v1/tenants', { nome: 'Cliente API', origem: 'api' }, tAdm)).corpo.id as string;
  const term = (await chamar('POST', `/v1/tenants/${emp}/terminals`, { nome: 'Caixa 01' }, tAdm)).corpo;

  // sem chave / chave errada
  assert.equal((await chamar('POST', '/v1/fiscal-operation', { codigo: 1 })).status, 401);
  assert.equal((await chamar('POST', '/v1/fiscal-operation', { codigo: 1 }, 'hk_invalida')).status, 401);
  assert.equal((await chamar('POST', '/v1/fiscal-operation', { codigo: 1 }, term.token)).status, 401);   // token de terminal nao serve

  // a chave aparece uma vez; a listagem mostra so o prefixo
  const k = await chamar('POST', `/v1/tenants/${emp}/api-keys`, { nome: 'ERP do cliente' }, tAdm);
  assert.equal(k.status, 201);
  const chave = k.corpo.chave as string;
  assert.match(chave, /^hk_/);
  const lista = await chamar('GET', `/v1/tenants/${emp}/api-keys`, undefined, tAdm);
  assert.deepEqual([lista.corpo.length, lista.corpo[0].prefixo], [1, chave.slice(0, 9)]);
  assert.ok(!JSON.stringify(lista.corpo).includes(chave));

  // exemplo do pedido: campo "ativo" Integer 0/1 no lugar de nat_ativa
  const um = await chamar('POST', '/v1/fiscal-operation', { codigo: 5102, descricao: 'Venda de mercadoria', ativo: 1 }, chave);
  assert.deepEqual([um.status, um.corpo.recebidos, um.corpo.alterados, um.corpo.inalterados], [200, 1, 1, 0]);
  // a resposta traz o id do registro (e a chave com os nomes do contrato)
  assert.match(um.corpo.registros[0].id, /^[0-9a-f-]{36}$/);
  assert.deepEqual([um.corpo.registros[0].indice, um.corpo.registros[0].situacao, um.corpo.registros[0].codigo], [0, 'criado', 5102]);
  const igual = await chamar('POST', '/v1/fiscal-operation', { codigo: 5102, descricao: 'Venda de mercadoria', ativo: 1 }, chave);
  assert.deepEqual([igual.corpo.alterados, igual.corpo.inalterados], [0, 1]);
  assert.deepEqual([igual.corpo.registros[0].id, igual.corpo.registros[0].situacao], [um.corpo.registros[0].id, 'inalterado']);   // o id e estavel

  // lote
  const lote = await chamar('POST', '/v1/fiscal-operation', [
    { codigo: 5102, descricao: 'Venda de mercadoria', ativo: 0 }, { codigo: 6102, descricao: 'Venda interestadual', ativo: 1, devolucaoCliente: 0 },
  ], chave);
  assert.deepEqual([lote.corpo.recebidos, lote.corpo.alterados, lote.corpo.inalterados], [2, 2, 0]);
  assert.deepEqual(lote.corpo.registros.map((r: any) => [r.indice, r.codigo]), [[0, 5102], [1, 6102]]);

  // o terminal recebe no formato do terminal (colunas internas), nao no externo
  const tTerm = term.token as string;
  const sync = await chamar('GET', '/v1/sync/fiscal-operations?desde=0', undefined, tTerm);
  const d5102 = sync.corpo.mudancas.find((m: any) => m.chave === '5102').dados;
  assert.deepEqual([d5102.nat_codigo, d5102.nat_ativa, d5102.nat_descrnatope], [5102, false, 'Venda de mercadoria']);
  assert.equal('ativo' in d5102, false);

  // validacao: nada e gravado quando algo esta errado, e a mensagem aponta o campo
  const ruim = await chamar('POST', '/v1/fiscal-operation', [
    { codigo: 7000, descricao: 'ok', ativo: 1 },
    { codigo: 7001, ativo: 2 },                    // valor fora de 0/1
    { descricao: 'sem codigo' },                   // chave ausente
    { codigo: 7002, nat_ativa: true },             // nome interno nao vale no contrato
  ], chave);
  assert.equal(ruim.status, 422);
  const det = ruim.corpo.detalhe as { indice: number; campo: string; erro: string }[];
  assert.ok(det.some((e) => e.indice === 1 && e.campo === 'ativo'));
  assert.ok(det.some((e) => e.indice === 2 && e.campo === 'codigo' && e.erro === 'obrigatorio'));
  assert.ok(det.some((e) => e.indice === 3 && e.campo === 'nat_ativa' && e.erro === 'campo desconhecido'));
  assert.equal((await db.query("select 1 from sync_rows where entidade = 'fiscal-operations' and chave = '7000'")).rowCount, 0);
  assert.equal((await chamar('POST', '/v1/fiscal-operation', 'texto', chave)).status, 400);

  // chave composta e outras entidades
  assert.equal((await chamar('POST', '/v1/price', { produto: 1, valor: 10 }, chave)).status, 422);
  assert.equal((await chamar('POST', '/v1/price', { tabelaPreco: 1, produto: 1, valor: 10, validade: '2026-12-31' }, chave)).status, 200);
  assert.equal((await chamar('POST', '/v1/price', { tabelaPreco: 1, produto: 2, validade: '31/12/2026' }, chave)).status, 422);

  // o envio entra no log como chamada do cliente, com o nome simples da entidade
  const logs = (await chamar('GET', `/v1/tenants/${emp}/logs?limite=50&canal=cliente-%3Ehub&rota=fiscal-operation`, undefined, tAdm)).corpo as any[];
  const l = logs.find((x) => x.status_http === 200);
  assert.deepEqual([l.canal, l.operacao, l.rota], ['cliente->hub', 'fiscal-operation', '/v1/fiscal-operation']);

  // revogar a chave
  const kid = lista.corpo[0].id;
  assert.equal((await chamar('DELETE', `/v1/tenants/${emp}/api-keys/${kid}`, undefined, tAdm)).status, 200);
  assert.equal((await chamar('POST', '/v1/fiscal-operation', { codigo: 1 }, chave)).status, 401);
});

test('API publica: id do registro, consultar, alterar (PATCH), pausar, remover e o que o terminal recebe', { skip: pula }, async () => {
  const tAdm = (await chamar('POST', '/v1/auth/login', { email: 'admin@hub.test', senha: 'senha-super-1' })).corpo.token as string;
  const emp = (await chamar('POST', '/v1/tenants', { nome: 'Cliente CRUD', origem: 'api' }, tAdm)).corpo.id as string;
  const term = (await chamar('POST', `/v1/tenants/${emp}/terminals`, { nome: 'Caixa' }, tAdm)).corpo;
  const tTerm = term.token as string;
  const chave = (await chamar('POST', `/v1/tenants/${emp}/api-keys`, { nome: 'k' }, tAdm)).corpo.chave as string;
  const syncSaldo = async (desde = 0) => (await chamar('GET', `/v1/sync/stock-balance?desde=${desde}`, undefined, tTerm)).corpo;

  // empresa de origem Agrosys nao usa a API publica
  const agro = (await chamar('POST', '/v1/tenants', { nome: 'Cliente ERP', origem: 'agrosys', padroes: { con_sincurl: 'http://x:9080', emp_empresa: 1, uni_unidade: 1, fil_filial: 1 } }, tAdm)).corpo.id as string;
  const kAgro = (await chamar('POST', `/v1/tenants/${agro}/api-keys`, { nome: 'k' }, tAdm)).corpo.chave as string;
  assert.equal((await chamar('POST', '/v1/stock-balance', { produto: 1 }, kAgro)).status, 403);

  // salvar devolve o id; o saldo muda sem recadastrar nada
  const novo = await chamar('POST', '/v1/stock-balance', { produto: 1001, quantidade: 10, vendavel: 1 }, chave);
  const id = novo.corpo.registros[0].id as string;
  assert.equal((await chamar('GET', `/v1/stock-balance/${id}`, undefined, chave)).corpo.quantidade, 10);
  assert.deepEqual((await chamar('GET', '/v1/stock-balance', undefined, chave)).corpo.registros.map((r: any) => r.id), [id]);

  const p1 = await chamar('PATCH', `/v1/stock-balance/${id}`, { quantidade: 7.5 }, chave);
  assert.deepEqual([p1.status, p1.corpo.id, p1.corpo.situacao], [200, id, 'alterado']);
  const lido = (await chamar('GET', `/v1/stock-balance/${id}`, undefined, chave)).corpo;
  assert.deepEqual([lido.quantidade, lido.vendavel, lido.produto, lido.pausado], [7.5, 1, 1001, false]);   // o resto do registro ficou
  assert.equal((await chamar('PATCH', `/v1/stock-balance/${id}`, { quantidade: 7.5 }, chave)).corpo.situacao, 'inalterado');
  // patch: chave nao muda, campo desconhecido e tipo invalido sao recusados
  const trocaChave = await chamar('PATCH', `/v1/stock-balance/${id}`, { produto: 2002 }, chave);
  assert.deepEqual([trocaChave.status, trocaChave.corpo.detalhe[0].campo], [422, 'produto']);
  assert.equal((await chamar('PATCH', `/v1/stock-balance/${id}`, { vendavel: 5 }, chave)).status, 422);
  assert.equal((await chamar('PATCH', `/v1/stock-balance/${id}`, { sal_item: 1 }, chave)).status, 422);
  assert.equal((await chamar('PATCH', '/v1/stock-balance/00000000-0000-0000-0000-000000000000', { quantidade: 1 }, chave)).status, 404);

  // o terminal recebe como upsert, com as colunas da chave
  let s = await syncSaldo();
  assert.deepEqual(s.chave, ['pro_codigo']);
  assert.deepEqual([s.mudancas.length, s.mudancas[0].acao, s.mudancas[0].dados.sal_item], [1, 'upsert', 7.5]);
  const cursor = s.seqMax;

  // pausar: some do terminal (excluir), continua salvo; retomar volta como upsert
  assert.equal((await chamar('POST', `/v1/stock-balance/${id}/pause`, {}, chave)).corpo.pausado, true);
  s = await syncSaldo(cursor);
  assert.deepEqual([s.mudancas.length, s.mudancas[0].acao, s.mudancas[0].dados.pro_codigo], [1, 'excluir', 1001]);
  assert.equal((await chamar('GET', `/v1/stock-balance/${id}`, undefined, chave)).corpo.pausado, true);
  assert.equal((await chamar('POST', `/v1/stock-balance/${id}/pause`, {}, chave)).corpo.pausado, true);   // repetir nao gera nova mudanca
  assert.equal((await syncSaldo(s.seqMax)).mudancas.length, 0);
  assert.equal((await chamar('POST', `/v1/stock-balance/${id}/resume`, {}, chave)).corpo.pausado, false);
  s = await syncSaldo(s.seqMax);
  assert.deepEqual([s.mudancas[0].acao, s.mudancas[0].dados.sal_item], ['upsert', 7.5]);

  // remover de verdade: o terminal recebe a exclusao; consultas passam a 404; salvar de novo recria
  const antes = s.seqMax;
  assert.deepEqual((await chamar('DELETE', `/v1/stock-balance/${id}`, undefined, chave)).corpo, { id, removido: true });
  s = await syncSaldo(antes);
  assert.deepEqual([s.mudancas[0].acao, s.mudancas[0].dados.pro_codigo], ['excluir', 1001]);
  assert.equal((await chamar('GET', `/v1/stock-balance/${id}`, undefined, chave)).status, 404);
  assert.equal((await chamar('DELETE', `/v1/stock-balance/${id}`, undefined, chave)).status, 404);
  assert.equal((await chamar('GET', '/v1/stock-balance', undefined, chave)).corpo.registros.length, 0);
  const volta = await chamar('POST', '/v1/stock-balance', { produto: 1001, quantidade: 3 }, chave);
  assert.deepEqual([volta.corpo.registros[0].id, volta.corpo.registros[0].situacao], [id, 'alterado']);   // mesmo id
  assert.equal((await syncSaldo(s.seqMax)).mudancas[0].acao, 'upsert');
  // outra empresa nao enxerga o registro
  const outra = (await chamar('POST', '/v1/tenants', { nome: 'Outra', origem: 'api' }, tAdm)).corpo.id as string;
  const kOutra = (await chamar('POST', `/v1/tenants/${outra}/api-keys`, { nome: 'k' }, tAdm)).corpo.chave as string;
  assert.equal((await chamar('GET', `/v1/stock-balance/${id}`, undefined, kOutra)).status, 404);
  assert.equal((await chamar('DELETE', `/v1/stock-balance/${id}`, undefined, kOutra)).status, 404);
});

test('API publica: o exemplo de cada recurso documentado e aceito e chega ao terminal', { skip: pula }, async () => {
  const { contratos, entidades } = await import('@hub/contracts');
  const tAdm = (await chamar('POST', '/v1/auth/login', { email: 'admin@hub.test', senha: 'senha-super-1' })).corpo.token as string;
  const emp = (await chamar('POST', '/v1/tenants', { nome: 'Cliente Exemplos', origem: 'api' }, tAdm)).corpo.id as string;
  const tTerm = (await chamar('POST', `/v1/tenants/${emp}/terminals`, { nome: 'Caixa' }, tAdm)).corpo.token as string;
  const chave = (await chamar('POST', `/v1/tenants/${emp}/api-keys`, { nome: 'k' }, tAdm)).corpo.chave as string;
  for (const c of contratos) {
    const r = await chamar('POST', `/v1/${c.caminho}`, c.exemplo, chave);
    assert.equal(r.status, 200, `${c.caminho}: ${JSON.stringify(r.corpo)}`);
    assert.equal(r.corpo.registros[0].situacao, 'criado', c.caminho);
    const s = await chamar('GET', `/v1/sync/${entidades[c.entidade].nome}?desde=0`, undefined, tTerm);
    assert.equal(s.corpo.mudancas.length, 1, c.caminho);
    assert.equal(s.corpo.mudancas[0].acao, 'upsert');
  }
});
