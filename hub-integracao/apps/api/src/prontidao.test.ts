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

const linha = (tenant: string, entidade: string, chave: string, dados: Record<string, unknown>) =>
  db.query(`insert into sync_rows (tenant_id, entidade, chave, dados, hash, id) values ($1,$2,$3,$4,$5,$6)`,
    [tenant, entidade, chave, JSON.stringify(dados), `h-${entidade}-${chave}`, randomUUID()]);

test('prontidao: checklist do que o PDV exige x o que a empresa ja tem', { skip: pula }, async () => {
  const t = (await chamar('POST', '/v1/auth/login', { email: 'admin@hub.test', senha: 'senha-super-1' })).corpo.token as string;
  const tenant = (await chamar('POST', '/v1/tenants', { nome: 'Dev', origem: 'api' }, t)).corpo.id as string;
  const item = (r: any, id: string) => r.corpo.itens.find((i: any) => i.id === id);

  // empresa vazia: nada pronto; os itens sem API aparecem marcados
  const vazio = await chamar('GET', `/v1/tenants/${tenant}/prontidao`, undefined, t);
  assert.equal(vazio.status, 200, JSON.stringify(vazio.corpo));
  assert.equal(vazio.corpo.faltam, vazio.corpo.obrigatorios);
  assert.equal(item(vazio, 'terminal').ok, false);
  assert.equal(item(vazio, 'impostos').semApi, undefined);
  assert.equal(item(vazio, 'bandeiras').obrigatorio, false);

  // terminal com parametros do emitente completos
  const tid = (await chamar('POST', `/v1/tenants/${tenant}/terminals`, { nome: 'Caixa 01' }, t)).corpo.id as string;
  const parcial = await chamar('PUT', `/v1/tenants/${tenant}/terminals/${tid}/config`,
    { valores: { con_razsoc: 'Loja X', con_cnpj: '12345678000190', con_uf: 'MT' } }, t);
  assert.equal(parcial.status, 200, JSON.stringify(parcial.corpo));
  const p1 = await chamar('GET', `/v1/tenants/${tenant}/prontidao`, undefined, t);
  assert.equal(item(p1, 'terminal').ok, true);
  assert.equal(item(p1, 'emitente').ok, false);
  assert.match(item(p1, 'emitente').detalhe, /(con_inscest)/);          // diz o que falta

  await chamar('PUT', `/v1/tenants/${tenant}/terminals/${tid}/config`, { valores: {
    con_inscest: '131234567', con_cep: '78700000', con_endereco: 'Rua A', con_numendereco: '10', con_bainome: 'Centro', con_cidnome: 'RONDONOPOLIS', cid_cidade: 5107602,
    tip_operacao: 1, cai_consufinal: 1,
  } }, t);
  const p2 = await chamar('GET', `/v1/tenants/${tenant}/prontidao`, undefined, t);
  assert.equal(item(p2, 'emitente').ok, true);
  assert.equal(item(p2, 'venda').ok, true);
  assert.equal(item(p2, 'consumidor').ok, false);                       // cliente 1 ainda nao existe

  // produto so conta como "pronto" com NCM + preco + saldo
  await linha(tenant, 'products', '10', { pro_codigo: 10, pro_ativo: 'yes', pro_clasfis: '12019000' });
  await linha(tenant, 'products', '11', { pro_codigo: 11, pro_ativo: 'yes', pro_clasfis: '12019000' });   // sem preco
  await linha(tenant, 'prices', '1|10', { ite_codigo: 10, pre_tiporeg: 1, pre_valor: 5 });
  await linha(tenant, 'stock-balance', '10', { pro_codigo: 10, sal_item: 3 });
  await linha(tenant, 'stock-balance', '11', { pro_codigo: 11, sal_item: 3 });
  const p3 = await chamar('GET', `/v1/tenants/${tenant}/prontidao`, undefined, t);
  assert.equal(item(p3, 'produtos').ok, true);
  assert.match(item(p3, 'produtos').detalhe, /1 pronto\(s\) de 2/);

  // consumidor final: cliente + unidade
  await linha(tenant, 'customers', '1', { cli_codigo: 1, cli_razsoc: 'CONSUMIDOR' });
  assert.equal(item(await chamar('GET', `/v1/tenants/${tenant}/prontidao`, undefined, t), 'consumidor').ok, false);
  await linha(tenant, 'customer-units', '1', { cli_codigo: 1 });
  assert.equal(item(await chamar('GET', `/v1/tenants/${tenant}/prontidao`, undefined, t), 'consumidor').ok, true);

  // cidades (cadastro comum) contam para todos
  assert.equal(item(await chamar('GET', `/v1/tenants/${tenant}/prontidao`, undefined, t), 'cidades').ok, false);
  await db.query("insert into cidades (codigo, codigo_ibge, nome, uf) values (1, 5107602, 'RONDONOPOLIS', 'MT')");
  assert.equal(item(await chamar('GET', `/v1/tenants/${tenant}/prontidao`, undefined, t), 'cidades').ok, true);

  // os recursos fiscais agora existem na API publica: enviados por chave de API, contam no checklist
  const chave = (await chamar('POST', `/v1/tenants/${tenant}/api-keys`, { nome: 'ERP' }, t)).corpo.chave as string;
  assert.equal(item(await chamar('GET', `/v1/tenants/${tenant}/prontidao`, undefined, t), 'impostos').semApi, undefined);
  const vinculo = await chamar('POST', '/v1/operation-fiscal-link', { sequencial: 1, natureza: 5102, todosComplementos: 1, operacao: 'VENDA' }, chave);
  const regra = await chamar('POST', '/v1/cfop-rule', { sequencial: 1, empresa: 1, filial: 1, unidade: 0, ufDestino: 'MT', tipoOperacao: 1, tipoSelecao: 0, referencia: 0, cfop: 5102, complemento: 1 }, chave);
  const imposto = await chamar('POST', '/v1/tax-rule', { codigo: 1, tipoImposto: 1, natureza: 5102, ufOrigem: 'MT', ufDestino: 'MT', vigenciaInicio: '2024-01-01', cst: 0, aliquota: 17 }, chave);
  for (const r of [vinculo, regra, imposto]) assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.deepEqual(imposto.corpo.registros[0].situacao, 'criado');
  const fiscais = await chamar('GET', `/v1/tenants/${tenant}/prontidao`, undefined, t);
  assert.deepEqual(['opernat', 'tabcfop', 'impostos'].map((id) => item(fiscais, id).ok), [true, true, true]);
  // o terminal recebe as regras pelo sync, com os nomes do PDV
  const tk = (await chamar('POST', `/v1/tenants/${tenant}/terminals`, { nome: 'Caixa fiscal' }, t)).corpo.token as string;
  const sync = (await chamar('GET', '/v1/sync/taxes?desde=0', undefined, tk)).corpo;
  assert.deepEqual([sync.mudancas.length, sync.mudancas[0].dados.imp_triicm, sync.mudancas[0].dados.imp_pcaliq, sync.mudancas[0].dados.est_destino], [1, 0, 17, 'MT']);
  assert.equal((await chamar('GET', '/v1/sync/cfop-table?desde=0', undefined, tk)).corpo.mudancas[0].dados.tcf_cfop, 5102);

  // ainda faltam os itens fiscais (sem API): a empresa nao esta completa
  const fim = await chamar('GET', `/v1/tenants/${tenant}/prontidao`, undefined, t);
  assert.ok(fim.corpo.faltam > 0);
  assert.deepEqual(fim.corpo.itens.filter((i: any) => i.obrigatorio && !i.ok && !i.semApi).map((i: any) => i.id).sort(),
    ['certificado', 'condicoes', 'nfce', 'operacoes', 'naturezas'].sort());
});

test('prontidao: o que vem do Postman (Referer: postman) fica gravado mas nao conta na homologacao', { skip: pula }, async () => {
  const t = (await chamar('POST', '/v1/auth/login', { email: 'admin@hub.test', senha: 'senha-super-1' })).corpo.token as string;
  const tenant = (await chamar('POST', '/v1/tenants', { nome: 'Empresa Postman', origem: 'api' }, t)).corpo.id as string;
  const chave = (await chamar('POST', `/v1/tenants/${tenant}/api-keys`, { nome: 'Postman' }, t)).corpo.chave as string;
  const postman = { Referer: 'postman' };
  const enviar = async (metodo: string, caminho: string, corpo: unknown, extra: Record<string, string> = {}) => {
    const r = await fetch(base + caminho, { method: metodo, headers: { 'content-type': 'application/json', authorization: `Bearer ${chave}`, ...extra }, body: JSON.stringify(corpo) });
    return { status: r.status, corpo: (await r.json().catch(() => null)) as any };
  };
  const checklist = async (id: string) => (await chamar('GET', `/v1/tenants/${tenant}/prontidao`, undefined, t)).corpo.itens.find((i: any) => i.id === id);
  const vinculo = { sequencial: 1, natureza: 5102, todosComplementos: 1, operacao: 'VENDA' };

  // enviado pelo Postman: grava (e vai para os terminais), mas nao conta
  assert.equal((await enviar('POST', '/v1/operation-fiscal-link', vinculo, postman)).status, 200);
  const teste = await checklist('opernat');
  assert.equal(teste.ok, false);
  assert.match(teste.detalhe, /Nenhum registro.*1 de teste do Postman/);
  assert.equal((await db.query("select teste from sync_rows where tenant_id = $1 and entidade = 'operation-fiscal-links'", [tenant])).rows[0].teste, true);

  // a mesma linha enviada pelo sistema do cliente (sem o cabecalho) passa a valer, mesmo sem mudar o conteudo
  const real = await enviar('POST', '/v1/operation-fiscal-link', vinculo);
  assert.equal(real.status, 200);
  assert.equal((await checklist('opernat')).ok, true);
  // o Postman mexendo numa linha que ja e valida (reenvio ou PATCH) nao a transforma em teste
  assert.equal((await enviar('POST', '/v1/operation-fiscal-link', { ...vinculo, operacao: 'DEVOLUCAO' }, postman)).status, 200);
  assert.equal((await checklist('opernat')).ok, true);
  assert.equal((await db.query("select teste from sync_rows where tenant_id = $1 and entidade = 'operation-fiscal-links'", [tenant])).rows[0].teste, false);

  // outra entidade so do Postman continua sem contar, e o aviso aparece no checklist
  assert.equal((await enviar('POST', '/v1/cfop-rule', { sequencial: 1, empresa: 1, filial: 1, unidade: 0, ufDestino: 'MT', tipoOperacao: 1, tipoSelecao: 0, referencia: 0, cfop: 5102, complemento: 1 }, postman)).status, 200);
  assert.equal((await checklist('tabcfop')).ok, false);

  // terminal criado pelo Postman nao conta; o mesmo codigo enviado de verdade passa a valer
  const tpost = await enviar('POST', '/v1/terminals', { codigo: '01', nome: 'Caixa 01' }, postman);
  assert.equal(tpost.status, 201);
  assert.equal((await checklist('terminal')).ok, false);
  assert.equal((await enviar('POST', '/v1/terminals', { codigo: '01', fiscal: { serieNfce: '1' } })).status, 200);
  assert.equal((await checklist('terminal')).ok, true);
  assert.equal((await enviar('POST', '/v1/terminals', { codigo: '01', fiscal: { serieNfce: '2' } }, postman)).status, 200);
  assert.equal((await checklist('terminal')).ok, true, 'o Postman nao tira a marca de valido');

  // Referer de outro lugar (navegador) nao e teste
  assert.equal((await enviar('POST', '/v1/operation-fiscal-link', { ...vinculo, sequencial: 2 }, { Referer: 'https://meuerp.com/tela' })).status, 200);
  assert.equal((await db.query("select teste from sync_rows where tenant_id = $1 and chave = '2'", [tenant])).rows[0].teste, false);
});
