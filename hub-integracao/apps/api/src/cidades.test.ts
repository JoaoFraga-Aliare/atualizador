import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import http, { type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { criarPool, type Db } from './db.js';
import { migrar } from './migrate.js';
import { criarApp } from './app.js';
import { hashSenha } from './senha.js';

// Precisa de um Postgres de teste: HUB_TEST_DATABASE_URL (banco descartavel).
const url = process.env.HUB_TEST_DATABASE_URL;
const pula = url ? false : 'defina HUB_TEST_DATABASE_URL';

let db: Db;
let server: Server;
let ibge: Server;
let base = '';

// IBGE falso: um municipio sem microrregiao (UF vem da regiao imediata) e um invalido (sem UF).
let municipios: unknown[] = [
  { id: 3550308, nome: 'São Paulo', microrregiao: { mesorregiao: { UF: { sigla: 'SP' } } } },
  { id: 5107602, nome: 'Rondonópolis', microrregiao: { mesorregiao: { UF: { sigla: 'MT' } } } },
  { id: 4212650, nome: 'Paraíso das Águas', microrregiao: null, 'regiao-imediata': { 'regiao-intermediaria': { UF: { sigla: 'SC' } } } },
  { id: 1, nome: 'Sem UF' },
];

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
  ibge = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(municipios)); }).listen(0);
  process.env.HUB_IBGE_URL = `http://127.0.0.1:${(ibge.address() as AddressInfo).port}`;
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
  ibge?.close();
  await db?.end();
});

test('cidades: carga pelo IBGE, consulta, edicao e o mesmo cadastro para todos os terminais', { skip: pula }, async () => {
  const tAdm = (await chamar('POST', '/v1/auth/login', { email: 'admin@hub.test', senha: 'senha-super-1' })).corpo.token as string;

  // vazio antes da carga
  assert.equal((await chamar('GET', '/v1/cidades', undefined, tAdm)).corpo.total, 0);

  // numeracao do Agrosys ja existente (codigo do PDV x codigo IBGE), como a migracao traz das empresas
  await db.query("insert into cidades (codigo, codigo_ibge, nome, uf) values (3829, 3550308, 'SAO PAULO', 'SP')");

  const carga = await chamar('POST', '/v1/cidades/ibge/carregar', {}, tAdm);
  assert.equal(carga.status, 200, JSON.stringify(carga.corpo));
  // Sao Paulo ja existe (mesmo nome sem acento): so os 2 municipios novos entram; o sem UF e ignorado
  assert.deepEqual(carga.corpo, { lidas: 3, novas: 2, alteradas: 0 });

  // novos ganham o proximo codigo do PDV (depois do maior), nome no padrao do Agrosys (maiusculo, sem acento)
  const lista = await chamar('GET', '/v1/cidades?busca=rondon', undefined, tAdm);
  assert.deepEqual(lista.corpo.itens, [{ codigo: 3831, nome: 'RONDONOPOLIS', uf: 'MT', codigoIbge: 5107602, codigoPais: 1058, populacao: null }]);
  assert.equal((await chamar('GET', '/v1/cidades?busca=5107602', undefined, tAdm)).corpo.total, 1);   // busca pelo IBGE
  assert.equal((await chamar('GET', '/v1/cidades?busca=3829', undefined, tAdm)).corpo.itens[0].nome, 'SAO PAULO');
  assert.equal((await chamar('GET', '/v1/cidades?uf=sc', undefined, tAdm)).corpo.itens[0].nome, 'PARAISO DAS AGUAS');
  assert.equal(lista.corpo.ultimaCarga.novas, 2);

  // recarregar nao altera nada; mudanca real no IBGE altera so o que mudou e mantem o codigo do PDV
  assert.deepEqual((await chamar('POST', '/v1/cidades/ibge/carregar', {}, tAdm)).corpo, { lidas: 3, novas: 0, alteradas: 0 });
  municipios = [{ id: 3550308, nome: 'São Paulo (capital)', microrregiao: { mesorregiao: { UF: { sigla: 'SP' } } } }, ...municipios.slice(1)];
  assert.deepEqual((await chamar('POST', '/v1/cidades/ibge/carregar', {}, tAdm)).corpo, { lidas: 3, novas: 0, alteradas: 1 });
  assert.equal((await chamar('GET', '/v1/cidades?busca=3829', undefined, tAdm)).corpo.itens[0].nome, 'SAO PAULO (CAPITAL)');

  // edicao no Hub (populacao) sobrevive a nova carga
  const edit = await chamar('PATCH', '/v1/cidades/3831', { populacao: 244911 }, tAdm);
  assert.equal(edit.corpo.populacao, 244911);
  await chamar('POST', '/v1/cidades/ibge/carregar', {}, tAdm);
  assert.equal((await chamar('GET', '/v1/cidades?busca=rondon', undefined, tAdm)).corpo.itens[0].populacao, 244911);
  assert.equal((await chamar('PATCH', '/v1/cidades/3831', { campoInvalido: 1 }, tAdm)).status, 400);
  assert.equal((await chamar('PATCH', '/v1/cidades/999', { nome: 'x' }, tAdm)).status, 404);

  // o POST por cliente deixou de existir
  const b = (await chamar('POST', '/v1/tenants', { nome: 'Cliente B', origem: 'api' }, tAdm)).corpo.id as string;
  const chave = (await chamar('POST', `/v1/tenants/${b}/api-keys`, { nome: 'k' }, tAdm)).corpo.chave as string;
  assert.equal((await chamar('POST', '/v1/city', { codigo: 1 }, chave)).status, 404);

  // dois clientes, terminais diferentes: recebem as mesmas cidades (cadastro unico)
  const a = (await chamar('POST', '/v1/tenants', { nome: 'Cliente A', origem: 'api' }, tAdm)).corpo.id as string;
  const tokA = (await chamar('POST', `/v1/tenants/${a}/terminals`, { nome: 'Caixa A' }, tAdm)).corpo.token as string;
  const tokB = (await chamar('POST', `/v1/tenants/${b}/terminals`, { nome: 'Caixa B' }, tAdm)).corpo.token as string;
  const sa = await chamar('GET', '/v1/sync/cities?desde=0', undefined, tokA);
  const sb = await chamar('GET', '/v1/sync/cities?desde=0', undefined, tokB);
  assert.equal(sa.status, 200, JSON.stringify(sa.corpo));
  assert.deepEqual(sa.corpo.mudancas, sb.corpo.mudancas);
  assert.equal(sa.corpo.mudancas.length, 3);
  // a chave e o codigo do PDV (Agrosys); o IBGE vai em cid_ibge
  const sp = sa.corpo.mudancas.find((m: any) => m.chave === '3829');
  assert.deepEqual(sp.dados, { cid_cidade: 3829, cid_nome: 'SAO PAULO (CAPITAL)', est_estado: 'SP', cid_ibge: 3550308, pai_pais: 1058, populacao: null });
  assert.equal(sp.acao, 'upsert');

  // incremental: depois de seqMax so vem o que mudou
  const seq = sa.corpo.seqMax;
  await chamar('PATCH', '/v1/cidades/3829', { populacao: 12300000 }, tAdm);
  const inc = await chamar('GET', `/v1/sync/cities?desde=${seq}`, undefined, tokA);
  assert.deepEqual(inc.corpo.mudancas.map((m: any) => [m.chave, m.dados.populacao]), [['3829', 12300000]]);

  // espelho: o que a empresa recebeu, por entidade (cidades vem do cadastro unico)
  await chamar('POST', '/v1/brand', [{ codigo: 1, descricao: 'Visa' }, { codigo: 2, descricao: 'Master' }], chave);
  const resumo = await chamar('GET', `/v1/tenants/${b}/espelho`, undefined, tAdm);
  assert.equal(resumo.status, 200, JSON.stringify(resumo.corpo));
  assert.equal(resumo.corpo.find((x: any) => x.entidade === 'brands').total, 2);
  assert.deepEqual(resumo.corpo.find((x: any) => x.entidade === 'cities').comum, true);
  assert.equal(resumo.corpo.find((x: any) => x.entidade === 'cities').total, 3);
  const marcas = await chamar('GET', `/v1/tenants/${b}/espelho/brands?busca=mast`, undefined, tAdm);
  assert.equal(marcas.corpo.total, 1);
  assert.equal(marcas.corpo.itens[0].dados.mar_descricao ?? marcas.corpo.itens[0].dados.ban_descricao, 'Master');
  const cid = await chamar('GET', `/v1/tenants/${b}/espelho/cities?busca=3829`, undefined, tAdm);
  assert.equal(cid.corpo.itens[0].dados.cid_ibge, 3550308);
  assert.equal((await chamar('GET', `/v1/tenants/${a}/espelho/brands`, undefined, tAdm)).corpo.total, 0);   // cada empresa ve so os seus
  assert.equal((await chamar('GET', `/v1/tenants/${b}/espelho/nao-existe`, undefined, tAdm)).status, 404);

  // sincronizar a empresa Agrosys nao tenta buscar cidades do ERP
  assert.equal((await chamar('GET', '/v1/docs', undefined, tAdm)).corpo.comuns[0].entidade, 'cities');
  const docs = (await chamar('GET', '/v1/docs', undefined, tAdm)).corpo;
  assert.ok(docs.criterios.length > 10 && docs.ordemDeCarga.length > 3);
  assert.deepEqual(docs.criterios.find((c: any) => c.id === 'produtos').enviar, ['product', 'price', 'stock-balance']);
});
