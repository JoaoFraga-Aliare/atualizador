import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import forge from 'node-forge';
import type { AddressInfo } from 'node:net';
import { criarPool, type Db } from './db.js';
import { migrar } from './migrate.js';
import { criarApp } from './app.js';
import { hashSenha } from './senha.js';
import { processarFila } from './envios.js';
import { expurgarLogs } from './log.js';
import { OPERACAO_CONFIG } from './config-agrosys.js';

// Roteamento por origem, contra um Agrosys de mentira (SOAP). Precisa de HUB_TEST_DATABASE_URL.
const url = process.env.HUB_TEST_DATABASE_URL;
const pula = url ? false : 'defina HUB_TEST_DATABASE_URL';

type Pedido = { op: string; param: Record<string, unknown>; receb: string };
const pedidos: Pedido[] = [];
let respostas: Record<string, (p: Pedido) => unknown> = {};
let fora = false;                                   // simula o Agrosys indisponivel
let agrosys: http.Server;
let hub: http.Server;
let db: Db;
let base = '';
let urlAgrosys = '';
let arquivoCert: Buffer = Buffer.alloc(0);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const un = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const ok = (retorno: unknown) => ({ 'tp-retorno': [{ 'msg-codigo': 1, 'msg-descricao': 'ok', 'msg-retorno': retorno }] });

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
      if (req.method === 'GET' && req.url === '/cert/loja.pfx') { res.end(arquivoCert); return; }
      if (fora) { res.statusCode = 503; res.end('<soap:Fault><faultstring>indisponivel</faultstring></soap:Fault>'); return; }
      const param = un(corpo.match(/<vdadosParam>([\s\S]*?)<\/vdadosParam>/)?.[1] ?? '{}');
      const receb = un(corpo.match(/<vdadosReceb>([\s\S]*?)<\/vdadosReceb>/)?.[1] ?? '');
      const item = (JSON.parse(param)['tp-param'] ?? [{}])[0];
      const p: Pedido = { op: item['tip-operacao'], param: item, receb };
      pedidos.push(p);
      const r = respostas[p.op]?.(p) ?? { 'tp-retorno': [{ 'msg-codigo': 9, 'msg-descricao': 'operacao desconhecida' }] };
      res.setHeader('content-type', 'text/xml');
      res.end(`<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><wsagroServer01Response xmlns="urn:progress-org:Agrosys:wsagro">` +
        `<vdadosRetorno>${esc(JSON.stringify(r))}</vdadosRetorno></wsagroServer01Response></s:Body></s:Envelope>`);
    });
  }).listen(0);
  urlAgrosys = `http://127.0.0.1:${(agrosys.address() as AddressInfo).port}`;

  db = criarPool(url);
  await db.query('drop schema public cascade; create schema public;');
  await migrar(db);
  await db.query('update log_config set gravar_sucesso = true');   // este teste confere o conteudo do log, inclusive das requisicoes que deram certo
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

test('origem Agrosys: sync, tempo real, cache sob demanda e envios roteados ao ERP', { skip: pula }, async () => {
  const tAdm = (await chamar('POST', '/v1/auth/login', { email: 'admin@hub.test', senha: 'senha-super-1' })).corpo.token as string;
  const emp = (await chamar('POST', '/v1/tenants', {
    nome: 'Cliente Agrosys', origem: 'agrosys',
    padroes: { con_sincurl: urlAgrosys, emp_empresa: 5, uni_unidade: 6, fil_filial: 7, cai_timeout: 5000 },
  }, tAdm)).corpo.id as string;
  const term = (await chamar('POST', `/v1/tenants/${emp}/terminals`, { nome: 'Caixa 01' }, tAdm)).corpo;
  const tTerm = term.token as string;

  // ---- catalogo: o Hub busca no ERP e grava so a diferenca ----
  respostas.PDVMARCA = () => ok([{ 'tp-cimarca': [{ mar_codigo: 1, mar_descricao: 'A' }, { mar_codigo: 2, mar_descricao: 'B' }] }]);
  respostas.PDVCFOP = () => ({ 'tp-retorno': [{ 'msg-codigo': 9, 'msg-descricao': 'sem permissao' }] });
  const s1 = await chamar('POST', `/v1/tenants/${emp}/sync`, { entidades: ['brands', 'fiscal-operations'] }, tAdm);
  assert.equal(s1.status, 200);
  const [marcas, cfop] = s1.corpo.resultados;
  assert.deepEqual([marcas.entidade, marcas.lidas, marcas.mudadas, marcas.erro], ['brands', 2, 2, undefined]);
  assert.match(cfop.erro, /sem permissao/);                                   // uma entidade com erro nao derruba as outras
  assert.deepEqual(pedidos[0].param, { 'tip-operacao': 'PDVMARCA', 'emp-empresa': 5, 'uni-unidade': 6, 'fil-filial': 7, 'tpp-quant': 100 });

  const s2 = await chamar('POST', `/v1/tenants/${emp}/sync`, { entidades: ['brands'] }, tAdm);
  assert.equal(s2.corpo.resultados[0].mudadas, 0);                            // nada mudou: nada novo para o terminal
  respostas.PDVMARCA = () => ok([{ 'tp-cimarca': [{ mar_codigo: 1, mar_descricao: 'A' }, { mar_codigo: 2, mar_descricao: 'B2' }] }]);
  assert.equal((await chamar('POST', `/v1/tenants/${emp}/sync`, { entidades: ['brands'] }, tAdm)).corpo.resultados[0].mudadas, 1);

  const sync = await chamar('GET', '/v1/sync/brands?desde=0', undefined, tTerm);
  assert.deepEqual(sync.corpo.mudancas.map((m: any) => m.chave).sort(), ['1', '2']);
  const status = await chamar('GET', `/v1/tenants/${emp}/sync-status`, undefined, tAdm);
  assert.ok(status.corpo.some((x: any) => x.entidade === 'brands' && x.origem === 'provider:agrosys'));

  // ---- tempo real: o terminal pergunta ao Hub; o Hub fala com o ERP com a config do terminal ----
  pedidos.length = 0;
  respostas.PDVCLIENTE = () => ok([{ tp_clifor: [{ cli_codigo: 77, cli_nome: 'Maria' }] }]);
  const op = await chamar('POST', '/v1/terminal/ops/PDVCLIENTE', { parametros: { 'cli-codigo': 77 } }, tTerm);
  assert.deepEqual([op.status, op.corpo.ok, op.corpo.codigo], [200, true, 1]);
  assert.match(op.corpo.retorno, /"cli_codigo":77/);                          // retorno cru, como o PDV ja interpreta
  assert.deepEqual(pedidos[0].param, { 'tip-operacao': 'PDVCLIENTE', 'emp-empresa': 5, 'uni-unidade': 6, 'fil-filial': 7, 'tpp-quant': 0, 'cli-codigo': 77 });
  // a consulta sob demanda alimentou o cache do Hub
  assert.deepEqual((await chamar('GET', '/v1/sync/customers?desde=0', undefined, tTerm)).corpo.mudancas.map((m: any) => m.chave), ['77']);
  assert.equal((await chamar('POST', '/v1/terminal/ops/PDVNAOEXISTE', {}, tTerm)).status, 404);
  assert.equal((await chamar('POST', '/v1/terminal/ops/PDVCLIENTE', {})).status, 401);
  // parametros do terminal valem na consulta (empresa/unidade/filial de caixa)
  await chamar('PUT', `/v1/tenants/${emp}/terminals/${term.id}/config`, { valores: { emp_empresa_cx: 50, uni_unidade_cx: 60, fil_filial_cx: 70 } }, tAdm);
  pedidos.length = 0;
  respostas.PDVSUPCAIXA = () => ok([{ 'tp-titulo': [] }]);
  await chamar('POST', '/v1/terminal/ops/PDVSUPCAIXA', {}, tTerm);
  assert.deepEqual([pedidos[0].param['emp-empresa'], pedidos[0].param['uni-unidade'], pedidos[0].param['fil-filial']], [50, 60, 70]);

  // ---- envios: nota aceita so com a frase exata; idempotente por chave ----
  pedidos.length = 0;
  respostas.PDVNFSCAPA = () => ({ 'tp-retorno': [{ 'msg-codigo': 1, 'msg-retorno': 'NOTA FISCAL INTEGRADA COM SUCESSO.' }] });
  const ds = { ds: { 'tt-nfscapa': [{ nfs_numero: 10, nfs_serie: '1' }] } };
  const n1 = await chamar('POST', '/v1/terminal/envios/nota', { chave: '1:10', payload: ds }, tTerm);
  assert.deepEqual([n1.status, n1.corpo.status], [200, 'enviado']);
  assert.equal(pedidos[0].receb, JSON.stringify(ds));
  const n2 = await chamar('POST', '/v1/terminal/envios/nota', { chave: '1:10', payload: ds }, tTerm);
  assert.deepEqual([n2.corpo.status, n2.corpo.id], ['enviado', n1.corpo.id]);
  assert.equal(pedidos.length, 1);                                            // o ERP nao recebeu duas vezes

  respostas.PDVNFSCAPA = () => ({ 'tp-retorno': [{ 'msg-codigo': 1, 'msg-retorno': 'OUTRA COISA' }] });
  const n3 = await chamar('POST', '/v1/terminal/envios/nota', { chave: '1:11', payload: ds }, tTerm);
  assert.deepEqual([n3.status, n3.corpo.status], [202, 'recusado']);          // recusa de negocio nao repete sozinha

  // falha tecnica (ERP fora): fica em erro e a fila reentrega depois
  fora = true;
  const m1 = await chamar('POST', '/v1/terminal/envios/movimento-caixa', { chave: 'his-5', payload: { 'tp-param': [{ ssp_movcaixa: 'SAN' }] } }, tTerm);
  assert.deepEqual([m1.status, m1.corpo.status, m1.corpo.tentativas], [202, 'erro', 1]);
  fora = false;
  respostas.PDVMOVCAIXA = () => ok('ok');
  assert.equal(await processarFila(db), 0);                                   // ainda dentro da espera
  await db.query("update outbox set proxima_tentativa = now() - interval '1 minute' where id = $1", [m1.corpo.id]);
  assert.equal(await processarFila(db), 1);
  assert.equal((await chamar('GET', `/v1/terminal/envios/${m1.corpo.id}`, undefined, tTerm)).corpo.status, 'enviado');

  // reenviar o recusado depois da correcao
  respostas.PDVNFSCAPA = () => ({ 'tp-retorno': [{ 'msg-codigo': 1, 'msg-retorno': 'NOTA FISCAL INTEGRADA COM SUCESSO.' }] });
  const re = await chamar('POST', `/v1/tenants/${emp}/outbox/${n3.corpo.id}/reenviar`, {}, tAdm);
  assert.equal(re.corpo.status, 'enviado');

  // ---- log de requisicoes e conexao ----
  // ping: marca o terminal como online e nao entra no log
  const ping = await chamar('POST', '/v1/terminal/ping', {}, tTerm);
  assert.equal(ping.corpo.ok, true);
  assert.equal(typeof ping.corpo.configVersao, 'number');
  const conexao = await chamar('GET', `/v1/tenants/${emp}/conexao`, undefined, tAdm);
  const cx = conexao.corpo.terminais.find((x: any) => x.id === term.id);
  assert.equal(cx.conexao, 'online');
  assert.ok(cx.requisicoes_24h > 0 && cx.ultima_busca && cx.ultima_chamada_erp);
  assert.ok(conexao.corpo.erp.chamadas_24h > 0);

  const logs = (q = '') => chamar('GET', `/v1/tenants/${emp}/logs?limite=200${q}`, undefined, tAdm).then((r) => r.corpo as any[]);
  const todos = await logs();
  assert.equal(todos.filter((l) => l.rota === '/v1/terminal/ping').length, 0);
  // a consulta do terminal e a chamada ao ERP que ela gerou ficam ligadas pela correlacao
  const opLog = todos.find((l) => l.canal === 'terminal->hub' && l.rota === '/v1/terminal/ops/PDVCLIENTE');
  assert.ok(opLog);
  assert.deepEqual([opLog.operacao, opLog.status_http, opLog.resultado, opLog.itens, opLog.terminal], ['PDVCLIENTE', 200, 'ok', 1, 'Caixa 01']);
  const erpLog = todos.find((l) => l.canal === 'hub->erp' && l.correlacao === opLog.correlacao);
  assert.ok(erpLog);
  assert.deepEqual([erpLog.operacao, erpLog.resultado, erpLog.rota], ['PDVCLIENTE', 'ok', 'SOAP wsagroServer01']);

  // corpos disponiveis, sem segredos (senha nao vai nem na requisicao nem na chamada ao ERP)
  respostas.PDVLOGIN = () => ok([{ tp_usuario: [{ usu_usuario: 'joao', usu_senha: 'hash-secreto' }] }]);
  await chamar('POST', '/v1/terminal/ops/PDVLOGIN', { parametros: { 'usu-usuario': 'joao', 'pdv-senha': 'senha-em-claro-9' } }, tTerm);
  const login = (await logs('&rota=PDVLOGIN')).filter((l) => l.operacao === 'PDVLOGIN');
  assert.equal(login.length, 2);
  for (const l of login) {
    const d = (await chamar('GET', `/v1/tenants/${emp}/logs/${l.id}`, undefined, tAdm)).corpo;
    assert.equal(d.corpo_expirado, false);
    const texto = `${d.req_corpo} ${d.resp_corpo}`;
    assert.ok(!texto.includes('senha-em-claro-9') && !texto.includes('hash-secreto'), 'segredo vazou no log');
    assert.match(texto, /joao/);
  }
  const detalhe = (await chamar('GET', `/v1/tenants/${emp}/logs/${opLog.id}`, undefined, tAdm)).corpo;
  assert.ok(detalhe.req_corpo === null || typeof detalhe.req_corpo === 'string');
  assert.match(detalhe.resp_corpo, /retorno/);
  assert.equal(detalhe.relacionadas.length, 1);

  // consultas sem novidade: aparecem, mas podem ser ocultadas
  const seq = (await chamar('GET', '/v1/sync/brands?desde=0', undefined, tTerm)).corpo.seqMax;
  await chamar('GET', `/v1/sync/brands?desde=${seq}`, undefined, tTerm);
  assert.ok((await logs('&rota=/v1/sync/brands')).some((l) => l.itens === 0));
  assert.ok(!(await logs('&rota=/v1/sync/brands&ocultarVazias=1')).some((l) => l.itens === 0));

  // erro do ERP fica registrado nos dois canais
  fora = true;
  assert.equal((await chamar('POST', '/v1/terminal/ops/PDVCLIENTE', {}, tTerm)).status, 502);
  fora = false;
  const falhas = await logs('&resultado=erro');
  assert.ok(falhas.some((l) => l.canal === 'terminal->hub' && l.status_http === 502));
  assert.ok(falhas.some((l) => l.canal === 'hub->erp' && /indisponivel/.test(l.mensagem)));

  // retencao: o texto grande expira, a requisicao e o status ficam
  await db.query("update request_log set corpo_expira_em = now() - interval '1 minute' where id = $1", [opLog.id]);
  const exp = await expurgarLogs(db);
  assert.ok(exp.corpos >= 1);
  const depois = (await chamar('GET', `/v1/tenants/${emp}/logs/${opLog.id}`, undefined, tAdm)).corpo;
  assert.deepEqual([depois.req_corpo, depois.resp_corpo, depois.corpo_expirado, depois.status_http, depois.resultado], [null, null, true, 200, 'ok']);
  assert.equal((await logs()).find((l) => l.id === opLog.id).tem_corpo, false);
  // e as linhas antigas saem depois de HUB_LOG_DIAS
  await db.query("update request_log set ocorrido_em = now() - interval '61 days' where id = $1", [opLog.id]);
  assert.ok((await expurgarLogs(db)).linhas >= 1);
  assert.equal((await chamar('GET', `/v1/tenants/${emp}/logs/${opLog.id}`, undefined, tAdm)).status, 404);
});

test('origem API: sem consulta em tempo real, o cliente busca os envios no outbox e confirma', { skip: pula }, async () => {
  const tAdm = (await chamar('POST', '/v1/auth/login', { email: 'admin@hub.test', senha: 'senha-super-1' })).corpo.token as string;
  const emp = (await chamar('POST', '/v1/tenants', { nome: 'Cliente API', origem: 'api' }, tAdm)).corpo.id as string;
  const term = (await chamar('POST', `/v1/tenants/${emp}/terminals`, { nome: 'Caixa API' }, tAdm)).corpo;
  const tTerm = term.token as string;

  assert.equal((await chamar('POST', `/v1/tenants/${emp}/sync`, {}, tAdm)).status, 501);   // nao ha ERP para buscar
  assert.equal((await chamar('POST', '/v1/terminal/ops/PDVCLIENTE', {}, tTerm)).status, 501);

  // o envio nao falha: fica pendente para o sistema do cliente
  const env = await chamar('POST', '/v1/terminal/envios/movimento-caixa', { chave: 'his-1', payload: { valor: 10 } }, tTerm);
  assert.deepEqual([env.status, env.corpo.status], [202, 'pendente']);
  const fila = await chamar('GET', `/v1/tenants/${emp}/outbox?status=pendente`, undefined, tAdm);
  assert.deepEqual(fila.corpo.map((x: any) => [x.tipo, x.chave, x.payload]), [['movimento-caixa', 'his-1', { valor: 10 }]]);
  const ack = await chamar('POST', `/v1/tenants/${emp}/outbox/${env.corpo.id}/ack`, { ok: true }, tAdm);
  assert.equal(ack.corpo.status, 'enviado');
  assert.equal((await chamar('GET', `/v1/terminal/envios/${env.corpo.id}`, undefined, tTerm)).corpo.status, 'enviado');
  assert.equal((await chamar('GET', `/v1/tenants/${emp}/outbox?status=pendente`, undefined, tAdm)).corpo.length, 0);
});

// .pfx de teste (autoassinado) com o CNPJ no CN
function criarPfx(senha: string, cnpj: string): Buffer {
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
  return Buffer.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(par.privateKey, [cert], senha, { algorithm: '3des' })).getBytes(), 'binary');
}

test('PDVCONFIG2: traz os parametros do Agrosys (de -> para), o resto segue manual e o certificado baixa cifrado', { skip: pula }, async () => {
  process.env.HUB_CERT_MASTER_KEY ??= randomBytes(32).toString('base64');
  process.env.HUB_WEBHOOK_REDE_INTERNA = 'sim';          // o Agrosys de teste fica em 127.0.0.1
  arquivoCert = criarPfx('segredo-da-loja', '12345678000190');
  const tAdm = (await chamar('POST', '/v1/auth/login', { email: 'admin@hub.test', senha: 'senha-super-1' })).corpo.token as string;
  const emp = (await chamar('POST', '/v1/tenants', {
    nome: 'Loja PDVCONFIG2', origem: 'agrosys',
    padroes: { con_sincurl: urlAgrosys, emp_empresa: 5, uni_unidade: 6, fil_filial: 7 },
  }, tAdm)).corpo.id as string;
  const tid = (await chamar('POST', `/v1/tenants/${emp}/terminals`, { nome: 'Caixa 01' }, tAdm)).corpo.id as string;
  // um valor manual que a LN nao conhece e um que ela conhece
  await chamar('PUT', `/v1/tenants/${emp}/terminals/${tid}/config`, { valores: { cai_loja: 1, cai_nomeloja: 'Loja Manual' } }, tAdm);

  respostas[OPERACAO_CONFIG] = () => ok({ 'tp-caixa': [{
    con_razsoc: 'LOJA X LTDA', con_cnpj: '12.345.678/0001-90', cid_cidade: 5107602, con_uf: 'MT',
    pdv_loja: '7', pdv_nfce: true, pdv_tolerancia: 0.5, pdv_hidebonif: false, cfg_smtp: 'smtp.x.com', cfg_porta: 587,
    cai_dtinivigencia: '2026-01-01', cai_icmspordentro: true, con_csc: '', pdv_aceitadesc: true, cfg_senha: 'segredo-email',
    cai_faltando: 'Parâmetros NFC-e (param-geral PARAMETROS_NFCe); Reforma tributária (agparam REFORMA_TRIBUTARIA)',
    con_urlcertificado: '/cert/loja.pfx', con_certsenha: 'segredo-da-loja', con_certnome: 'loja.pfx',
  }] });
  const rota = `/v1/tenants/${emp}/terminals/${tid}/config/agrosys`;

  // previa: mostra de -> para e nao grava nada
  const previa = (await chamar('POST', rota, {}, tAdm)).corpo;
  assert.equal(previa.aplicado, false, JSON.stringify(previa));
  const campo = (c: string) => previa.mudancas.find((x: any) => x.campo === c);
  assert.deepEqual([campo('cai_loja').de, campo('cai_loja').para], [1, 7]);                  // pdv_loja -> cai_loja
  assert.equal(campo('con_cnpj').para, '12345678000190');                                    // so digitos
  assert.equal(campo('con_nfce').para, true);
  assert.equal(campo('con_emailsmtp').para, 'smtp.x.com');                                   // cfg_smtp -> con_emailsmtp
  assert.equal(campo('con_csc'), undefined);                                                 // em branco: nao toca
  assert.ok(previa.ignorados.some((x: any) => x.campo === 'cfg_senha') && previa.ignorados.some((x: any) => x.campo === 'pdv_aceitadesc'));
  assert.equal(previa.certificado.disponivel, true);
  assert.deepEqual(previa.faltando, ['Parâmetros NFC-e (param-geral PARAMETROS_NFCe)', 'Reforma tributária (agparam REFORMA_TRIBUTARIA)']);
  assert.equal(JSON.stringify(previa).includes('segredo-da-loja') || JSON.stringify(previa).includes('segredo-email'), false);
  assert.equal((await chamar('GET', `/v1/tenants/${emp}/terminals/${tid}/config`, undefined, tAdm)).corpo.valores.cai_loja, 1);
  assert.equal((await chamar('GET', `/v1/tenants/${emp}/certificado`, undefined, tAdm)).corpo.existe, false);

  // aplicar: grava o que veio, preserva o manual e guarda o certificado cifrado
  const feito = (await chamar('POST', rota, { aplicar: true }, tAdm)).corpo;
  assert.deepEqual([feito.aplicado, feito.mudou, feito.avisos], [true, true, []], JSON.stringify(feito));
  const cfg = (await chamar('GET', `/v1/tenants/${emp}/terminals/${tid}/config`, undefined, tAdm)).corpo.valores;
  assert.deepEqual([cfg.cai_loja, cfg.con_razsoc, cfg.cai_nomeloja, cfg.cai_dtinivigencia], [7, 'LOJA X LTDA', 'Loja Manual', '2026-01-01']);
  assert.equal(cfg.con_certsenha, undefined);
  const cert = (await chamar('GET', `/v1/tenants/${emp}/certificado`, undefined, tAdm)).corpo;
  assert.deepEqual([cert.existe, cert.cnpj], [true, '12345678000190']);
  assert.equal(JSON.stringify(cert).includes('segredo-da-loja'), false);

  // repetir nao muda nada
  const igual = (await chamar('POST', rota, { aplicar: true }, tAdm)).corpo;
  assert.deepEqual([igual.mudou, igual.mudancas.length], [false, 0]);

  // erro do Agrosys vira mensagem clara; empresa de origem API recusa
  respostas[OPERACAO_CONFIG] = () => ({ 'tp-retorno': [{ 'msg-codigo': 9, 'msg-descricao': 'Configuracoes nao cadastradas.' }] });
  const erro = await chamar('POST', rota, {}, tAdm);
  assert.equal(erro.status, 502);
  assert.match(erro.corpo.erro, /nao cadastradas/);
  const api = (await chamar('POST', '/v1/tenants', { nome: 'Via API', origem: 'api' }, tAdm)).corpo.id as string;
  const tApi = (await chamar('POST', `/v1/tenants/${api}/terminals`, { nome: 'Cx' }, tAdm)).corpo.id as string;
  assert.equal((await chamar('POST', `/v1/tenants/${api}/terminals/${tApi}/config/agrosys`, {}, tAdm)).status, 409);
  delete process.env.HUB_WEBHOOK_REDE_INTERNA;
});
