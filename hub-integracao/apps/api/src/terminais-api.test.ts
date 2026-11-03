import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import forge from 'node-forge';
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

function criarPfx(senha: string, cnpj = '12345678000190'): string {
  const par = forge.pki.rsa.generateKeyPair({ bits: 1024 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = par.publicKey;
  cert.serialNumber = '0a1b2c';
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
  const attrs = [{ name: 'commonName', value: `EMPRESA TESTE LTDA:${cnpj}` }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(par.privateKey, forge.md.sha256.create());
  return Buffer.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(par.privateKey, [cert], senha, { algorithm: '3des' })).getBytes(), 'binary').toString('base64');
}

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
  process.env.HUB_CERT_MASTER_KEY = randomBytes(32).toString('base64');
  db = criarPool(url);
  await db.query('drop schema public cascade; create schema public;');
  await migrar(db);
  await db.query('update log_config set gravar_sucesso = true');   // este teste confere o conteudo do log, inclusive das requisicoes que deram certo
  await db.query('insert into users (id, email, nome, senha_hash, is_super) values ($1,$2,$3,$4,true)',
    [randomUUID(), 'admin@hub.test', 'Admin', await hashSenha('senha-super-1')]);
  server = criarApp({ db, segredo: 'segredo-de-teste-123456' }).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  delete process.env.HUB_CERT_MASTER_KEY;
  server?.close();
  await db?.end();
});

test('API publica de terminais: cadastro completo, atualizacao parcial, certificado e validacoes', { skip: pula }, async () => {
  const t = (await chamar('POST', '/v1/auth/login', { email: 'admin@hub.test', senha: 'senha-super-1' })).corpo.token as string;
  const tenant = (await chamar('POST', '/v1/tenants', { nome: 'Cliente API', origem: 'api' }, t)).corpo.id as string;
  const chave = (await chamar('POST', `/v1/tenants/${tenant}/api-keys`, { nome: 'ERP' }, t)).corpo.chave as string;
  const agro = (await chamar('POST', '/v1/tenants', { nome: 'Agrosys', origem: 'agrosys', padroes: { con_sincurl: 'http://erp.test:9080', emp_empresa: 1, uni_unidade: 1, fil_filial: 1 } }, t)).corpo.id as string;

  // sem chave / empresa Agrosys nao usam
  assert.equal((await chamar('POST', '/v1/terminals', { nome: 'x' })).status, 401);
  const chaveAgro = (await chamar('POST', `/v1/tenants/${agro}/api-keys`, { nome: 'x' }, t)).corpo;
  assert.ok(chaveAgro.chave === undefined || (await chamar('POST', '/v1/terminals', { nome: 'x' }, chaveAgro.chave)).status === 403);

  const completo = {
    codigo: '01', nome: 'Caixa 01',
    empresa: { razaoSocial: 'Loja X LTDA', nomeFantasia: 'Loja X', cnpj: '12.345.678/0001-90', inscricaoEstadual: '131234567', cep: '78700-000', endereco: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'RONDONOPOLIS', uf: 'MT', codigoCidade: 5107602 },
    fiscal: { serieNfce: '1', csc: 'ABC123', idCsc: '000001', operacao: 1, consumidorFinal: 1 },
    parametros: { cai_loja: 7 },
    certificado: { pfx: criarPfx('segredo-123'), senha: 'segredo-123', nome: 'loja.pfx' },
  };
  const criado = await chamar('POST', '/v1/terminals', completo, chave);
  assert.equal(criado.status, 201, JSON.stringify(criado.corpo));
  assert.deepEqual([criado.corpo.situacao, criado.corpo.codigo, criado.corpo.nome], ['criado', '01', 'Caixa 01']);
  assert.match(criado.corpo.token, /^tk_/);
  assert.equal(criado.corpo.ambiente, 'producao');                                  // padrao
  assert.equal(criado.corpo.empresa.cnpj, '12345678000190');                       // so digitos
  assert.deepEqual([criado.corpo.fiscal.serieNfce, criado.corpo.fiscal.csc, criado.corpo.parametros.cai_loja], ['1', 'ABC123', 7]);
  assert.deepEqual([criado.corpo.certificado.existe, criado.corpo.certificado.cnpj], [true, '12345678000190']);
  assert.equal(JSON.stringify(criado.corpo).includes('segredo-123'), false);       // senha nunca volta
  const id = criado.corpo.id as string;

  // o terminal usa o token e baixa o certificado (versao do ping)
  const tk = criado.corpo.token as string;
  assert.equal((await chamar('POST', '/v1/terminal/ping', {}, tk)).corpo.certificadoVersao, criado.corpo.certificado.versao);
  assert.equal((await chamar('GET', '/v1/terminal/certificado?versao=0', undefined, tk)).corpo.senha, 'segredo-123');
  const cfg = (await chamar('GET', '/v1/terminal/config', undefined, tk)).corpo.valores;
  assert.deepEqual([cfg.con_razsoc, cfg.cid_cidade, cfg.con_certsenha], ['Loja X LTDA', 5107602, undefined]);
  assert.equal(cfg.con_tpamb, 1);                                                   // ambiente do token: producao
  const ping = (await chamar('POST', '/v1/terminal/ping', {}, tk)).corpo;
  assert.deepEqual([ping.terminal, ping.empresa, ping.ambiente], ['Caixa 01', 'Cliente API', 'producao']);

  // atualizacao parcial: so o que veio muda (mesmo codigo = mesmo terminal), sem novo token
  const parcial = await chamar('POST', '/v1/terminals', { codigo: '01', fiscal: { serieNfce: '2' } }, chave);
  assert.equal(parcial.status, 200);
  assert.deepEqual([parcial.corpo.situacao, parcial.corpo.id, parcial.corpo.token], ['alterado', id, undefined]);
  assert.deepEqual([parcial.corpo.fiscal.serieNfce, parcial.corpo.fiscal.csc, parcial.corpo.empresa.razaoSocial], ['2', 'ABC123', 'Loja X LTDA']);
  assert.ok(parcial.corpo.versaoConfiguracao > criado.corpo.versaoConfiguracao);
  // mandar tudo de novo sem mudancas: inalterado
  const igual = await chamar('POST', '/v1/terminals', { ...completo, fiscal: { ...completo.fiscal, serieNfce: '2' }, certificado: undefined }, chave);
  assert.equal(igual.corpo.situacao, 'inalterado');

  // numeracao em lote (ERP): so sobe, serie nova vale, forcar volta, desconhecido nao e criado
  const num = (corpo: unknown) => chamar('POST', '/v1/terminals/numeracao', corpo, chave);
  const um = async (item: Record<string, unknown>) => (await num([{ codigo: '01', ...item }])).corpo.resultados[0];
  assert.deepEqual([(await um({ serieNfce: 1, ultimaNfce: 100 })).situacao, (await um({ ultimaNfce: 100 })).situacao], ['alterado', 'inalterado']);
  const sobe = await um({ ultimaNfce: 150, ultimaNfe: 7 });
  assert.deepEqual([sobe.situacao, sobe.ultimaNfce, sobe.ultimaNfe], ['alterado', 150, 7]);
  const volta = await um({ ultimaNfce: 120 });                                        // menor, mesma serie: ignora e avisa
  assert.deepEqual([volta.situacao, volta.ultimaNfce], ['inalterado', 150]);
  assert.match(volta.avisos[0], /menor que a atual \(150\)/);
  const serieNova = await um({ serieNfce: 2, ultimaNfce: 0 });                       // serie nova recomeca
  assert.deepEqual([serieNova.serieNfce, serieNova.ultimaNfce], ['2', 0]);
  await um({ ultimaNfce: 40 });
  const forcada = await um({ ultimaNfce: 10, forcarNumeracao: true });
  assert.equal(forcada.ultimaNfce, 10);
  const lote = (await num({ terminais: [{ codigo: 'nao-existe', ultimaNfce: 1 }, { codigo: '01', ultimaNfce: 'x' }] })).corpo.resultados;
  assert.deepEqual([lote[0].situacao, lote[1].situacao], ['nao_encontrado', 'recusado']);
  assert.equal((await num([{ codigo: '01', ultimaNfce: 11 }])).status, 200);
  assert.equal((await chamar('POST', '/v1/terminals/numeracao', [], chave)).status, 422);

  // ambiente: producao ou homologacao (so esses dois valores)
  assert.equal((await chamar('PATCH', `/v1/terminals/${id}`, { ambiente: 'teste' }, chave)).status, 422);
  const homolog = await chamar('PATCH', `/v1/terminals/${id}`, { ambiente: 'homologacao' }, chave);
  assert.deepEqual([homolog.corpo.situacao, homolog.corpo.ambiente], ['alterado', 'homologacao']);
  assert.equal((await chamar('GET', '/v1/terminals', undefined, chave)).corpo.terminais[0].ambiente, 'homologacao');
  const cfgHom = (await chamar('GET', '/v1/terminal/config?desde=0', undefined, tk)).corpo;      // mudar o ambiente sobe a versao
  assert.equal(cfgHom.valores.con_tpamb, 2);
  assert.equal((await chamar('GET', `/v1/terminal/config?desde=${cfgHom.versao}`, undefined, tk)).corpo.mudou, false);
  await chamar('PATCH', `/v1/terminals/${id}`, { ambiente: 'producao' }, chave);

  // editar terminal existente pelo gerencial: o ambiente muda, sobe a versao e o terminal passa a receber o con_tpamb novo
  const v0 = (await chamar('GET', '/v1/terminal/config?desde=0', undefined, tk)).corpo;
  assert.equal(v0.valores.con_tpamb, 1);
  const ed = await chamar('PATCH', `/v1/tenants/${tenant}/terminals/${id}`, { ambiente: 'homologacao', nome: 'Caixa 01 (teste)' }, t);
  assert.deepEqual([ed.status, ed.corpo.ambiente, ed.corpo.ambienteAnterior, ed.corpo.nome], [200, 'homologacao', 'producao', 'Caixa 01 (teste)']);
  const v1 = (await chamar('GET', `/v1/terminal/config?desde=${v0.versao}`, undefined, tk)).corpo;
  assert.deepEqual([v1.mudou, v1.versao > v0.versao, v1.valores.con_tpamb], [true, true, 2]);
  // mesmo ambiente de novo: a versao nao sobe
  await chamar('PATCH', `/v1/tenants/${tenant}/terminals/${id}`, { ambiente: 'homologacao' }, t);
  assert.equal((await chamar('GET', `/v1/terminal/config?desde=${v1.versao}`, undefined, tk)).corpo.mudou, false);
  assert.equal((await chamar('PATCH', `/v1/tenants/${tenant}/terminals/${id}`, { ambiente: 'teste' }, t)).status, 400);
  assert.equal((await chamar('PATCH', `/v1/tenants/${tenant}/terminals/${id}`, { token_hash: 'x' }, t)).status, 400);
  assert.equal((await chamar('PATCH', `/v1/tenants/${tenant}/terminals/${randomUUID()}`, { nome: 'x' }, t)).status, 404);
  await chamar('PATCH', `/v1/tenants/${tenant}/terminals/${id}`, { ambiente: 'producao', nome: 'Caixa 01' }, t);

  // resumo do administrador: so super; traz os terminais da empresa e o trafego do PDV nas ultimas 24 h
  assert.equal((await chamar('GET', '/v1/resumo', undefined, chave)).status, 401);
  const resumo = (await chamar('GET', '/v1/resumo', undefined, t)).corpo;
  assert.deepEqual([typeof resumo.pdv.requisicoes, typeof resumo.pdv.erros, typeof resumo.outros.erros], ['number', 'number', 'number']);
  assert.deepEqual(resumo.empresas.find((e: any) => e.id === tenant)?.terminais, 1);

  // PATCH por id; null limpa o campo
  const patch = await chamar('PATCH', `/v1/terminals/${id}`, { empresa: { nomeFantasia: null }, nome: 'Caixa Frente', ativo: 0 }, chave);
  assert.deepEqual([patch.corpo.situacao, patch.corpo.nome, patch.corpo.ativo, patch.corpo.empresa.nomeFantasia], ['alterado', 'Caixa Frente', false, undefined]);

  // so troca o certificado
  const troca = await chamar('PATCH', `/v1/terminals/${id}`, { certificado: { pfx: criarPfx('outra'), senha: 'outra' } }, chave);
  assert.equal(troca.corpo.certificado.versao, criado.corpo.certificado.versao + 1);

  // validacoes: nada e gravado
  const antes = (await chamar('GET', '/v1/terminals', undefined, chave)).corpo.terminais.length;
  const err = async (corpo: unknown, status = 422) => { const r = await chamar('POST', '/v1/terminals', corpo, chave); assert.equal(r.status, status, JSON.stringify(r.corpo)); return r.corpo; };
  await err({ nome: 'Y', empresa: { campoInexistente: 1 } });                                                     // grupo estrito
  await err({ nome: 'Y', parametros: { cai_loja: 'abc' } });                                                      // parametro invalido
  await err({ nome: 'Y', parametros: { campo_que_nao_existe: 1 } });
  assert.equal((await err({ nome: 'Y', parametros: { con_certsenha: 'x' } })).detalhe[0].erro, 'use certificado');
  assert.equal((await err({ nome: 'Y', empresa: { uf: 'MT' }, parametros: { con_uf: 'SP' } })).detalhe[0].erro, 'duplicado');
  await err({ codigo: '99', empresa: { uf: 'MT' } });                                                             // criar exige nome
  assert.match((await err({ nome: 'Y', certificado: { pfx: criarPfx('abc'), senha: 'errada' } })).erro, /Senha do certificado invalida/);
  assert.match((await err({ nome: 'Y', empresa: { cnpj: '99888777000166' }, certificado: { pfx: criarPfx('abc'), senha: 'abc' } })).erro, /nao confere/);
  assert.equal((await chamar('GET', '/v1/terminals', undefined, chave)).corpo.terminais.length, antes);          // nenhum terminal pela metade

  // token novo, listagem, certificado da empresa e remocao
  const novo = await chamar('POST', `/v1/terminals/${id}/token`, {}, chave);
  assert.notEqual(novo.corpo.token, tk);
  assert.equal((await chamar('POST', '/v1/terminal/ping', {}, tk)).status, 401);
  assert.equal((await chamar('GET', '/v1/certificado', undefined, chave)).corpo.existe, true);
  assert.equal((await chamar('DELETE', '/v1/certificado', undefined, chave)).status, 200);
  assert.equal((await chamar('GET', '/v1/certificado', undefined, chave)).corpo.existe, false);
  assert.equal((await chamar('PUT', '/v1/certificado', { pfx: criarPfx('z'), senha: 'z' }, chave)).status, 201);
  assert.equal((await chamar('DELETE', `/v1/terminals/${id}`, undefined, chave)).status, 200);
  assert.equal((await chamar('GET', `/v1/terminals/${id}`, undefined, chave)).status, 404);

  // filtro do log: resultado=falha traz so o que nao deu certo (recusado + erro)
  const falhas = (await chamar('GET', `/v1/tenants/${tenant}/logs?resultado=falha`, undefined, t)).corpo as any[];
  const todos = (await chamar('GET', `/v1/tenants/${tenant}/logs`, undefined, t)).corpo as any[];
  assert.ok(falhas.length > 0 && falhas.length < todos.length && falhas.every((l) => l.resultado !== 'ok'));
  assert.ok(todos.some((l) => l.resultado === 'ok'));

  // o log de requisicoes nao guarda o arquivo nem a senha do certificado
  const logs = JSON.stringify((await db.query("select req_corpo, resp_corpo from request_log where rota like '/v1/terminals%' or rota like '/v1/certificado%'")).rows);
  assert.ok(logs.length > 10 && !logs.includes('segredo-123') && !logs.includes(completo.certificado.pfx.slice(0, 40)));

  // menu Logs do administrador: retencao, notificacoes e limpeza (so o administrador)
  assert.equal((await chamar('GET', '/v1/admin/logs/config', undefined, chave)).status, 401);
  const cfg0 = (await chamar('GET', '/v1/admin/logs/config', undefined, t)).corpo;
  assert.deepEqual([cfg0.diasLog, cfg0.horasCorpo, cfg0.notificar.terminal_erro, cfg0.notificar.terminal_recusado], [60, 6, true, false]);
  assert.ok(cfg0.totais.linhas > 0 && cfg0.categorias.length === 6);
  assert.equal((await chamar('PUT', '/v1/admin/logs/config', { diasLog: 0 }, t)).status, 422);
  assert.equal((await chamar('PUT', '/v1/admin/logs/config', { notificar: { inventada: true } }, t)).status, 422);
  const cfg1 = (await chamar('PUT', '/v1/admin/logs/config', { diasLog: 30, horasCorpo: 2, notificar: { terminal_recusado: true, cliente_recusado: true } }, t)).corpo;
  assert.deepEqual([cfg1.diasLog, cfg1.horasCorpo, cfg1.personalizado.diasLog, cfg1.notificar.terminal_recusado], [30, 2, true, true]);
  await chamar('POST', '/v1/terminals', { codigo: 'x', ambiente: 'teste' }, chave);                     // gera uma requisicao recusada
  const notifs = (await chamar('GET', '/v1/admin/logs/notificacoes', undefined, t)).corpo.itens as any[];
  assert.ok(notifs.some((n) => n.resultado === 'recusado' && n.total >= 1 && n.rota === '/v1/terminals'), JSON.stringify(notifs));
  await chamar('PUT', '/v1/admin/logs/config', { notificar: { terminal_recusado: false, cliente_recusado: false } }, t);
  assert.equal(((await chamar('GET', '/v1/admin/logs/notificacoes', undefined, t)).corpo.itens as any[]).some((n) => n.resultado === 'recusado'), false);
  assert.equal((await chamar('PUT', '/v1/admin/logs/config', { diasLog: null, horasCorpo: null }, t)).corpo.diasLog, 60);   // volta ao padrao
  assert.equal((await chamar('POST', '/v1/admin/logs/limpar', { alvo: 'antigos' }, t)).status, 422);
  assert.ok((await chamar('POST', '/v1/admin/logs/limpar', { alvo: 'corpos' }, t)).corpo.corposLimpos >= 0);
  const semOk = (await chamar('POST', '/v1/admin/logs/limpar', { alvo: 'sucesso' }, t)).corpo;
  assert.ok(semOk.removidas > 0);
  assert.equal((await db.query("select count(*)::int as n from request_log where resultado = 'ok'")).rows[0].n, 0);
  assert.ok((await db.query('select count(*)::int as n from request_log')).rows[0].n > 0);               // erros ficam
  assert.ok((await chamar('POST', '/v1/admin/logs/limpar', { alvo: 'tudo' }, t)).corpo.removidas > 0);
  assert.equal((await db.query('select count(*)::int as n from request_log')).rows[0].n, 0);

  // excluir a empresa: so enquanto nenhum terminal dela conectou
  const nova = (await chamar('POST', '/v1/tenants', { nome: 'Sem uso', origem: 'api' }, t)).corpo.id as string;
  await chamar('POST', `/v1/tenants/${nova}/terminals`, { nome: 'Caixa' }, t);
  assert.equal((await chamar('DELETE', `/v1/tenants/${nova}`, undefined, t)).status, 200);
  assert.equal((await chamar('GET', `/v1/tenants/${nova}`, undefined, t)).status, 404);
  const usada = (await chamar('POST', '/v1/tenants', { nome: 'Ja usada', origem: 'api' }, t)).corpo.id as string;
  const tkUsada = (await chamar('POST', `/v1/tenants/${usada}/terminals`, { nome: 'Caixa' }, t)).corpo.token as string;
  await chamar('POST', '/v1/terminal/ping', {}, tkUsada);
  assert.equal((await chamar('DELETE', `/v1/tenants/${usada}`, undefined, t)).status, 409);   // ja conectou
});
