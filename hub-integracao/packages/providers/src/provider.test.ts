import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { urlAgrosys, montarEnvelope, lerEnvelope, ErroSoap } from './soap';
import { ProviderAgrosys, ProviderApi, configAgrosys, ErroProvider, criarProvider } from './provider';

// ---- Agrosys de mentira: responde conforme tip-operacao -------------------------------
type Pedido = { op: string; param: Record<string, unknown>; receb: string; path: string };
const pedidos: Pedido[] = [];
let respostas: Record<string, (p: Pedido) => unknown> = {};
let server: http.Server;
let base = '';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const un = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

before(async () => {
  server = http.createServer((req, res) => {
    let corpo = '';
    req.on('data', (c) => (corpo += c));
    req.on('end', () => {
      const param = un(corpo.match(/<vdadosParam>([\s\S]*?)<\/vdadosParam>/)?.[1] ?? '{}');
      const receb = un(corpo.match(/<vdadosReceb>([\s\S]*?)<\/vdadosReceb>/)?.[1] ?? '');
      const item = (JSON.parse(param)['tp-param'] ?? [{}])[0];
      const p: Pedido = { op: item['tip-operacao'], param: item, receb, path: req.url ?? '' };
      pedidos.push(p);
      if (p.op === 'FALHA') { res.statusCode = 500; res.end('<soap:Fault><faultstring>quebrou</faultstring></soap:Fault>'); return; }
      const r = respostas[p.op]?.(p) ?? { 'tp-retorno': [{ 'msg-codigo': 9, 'msg-descricao': 'operacao desconhecida' }] };
      res.setHeader('content-type', 'text/xml');
      res.end(`<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>` +
        `<wsagroServer01Response xmlns="urn:progress-org:Agrosys:wsagro"><result>ok</result><vdadosRetorno>${esc(JSON.stringify(r))}</vdadosRetorno></wsagroServer01Response></soap:Body></soap:Envelope>`);
    });
  }).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => { server.close(); });

const cfg = () => configAgrosys({ con_sincurl: base, emp_empresa: 1, uni_unidade: 2, fil_filial: 3, cai_timeout: 5000 });
const ok = (retorno: unknown) => ({ 'tp-retorno': [{ 'msg-codigo': 1, 'msg-descricao': 'ok', 'msg-retorno': retorno }] });

test('url: mesma regra do GetwsagroObj (porta e caminho)', () => {
  assert.equal(urlAgrosys({ con_sincurl: 'http://erp' }), 'http://erp:9080/wsa/wsa1/');
  assert.equal(urlAgrosys({ con_sincurl: 'http://erp', cai_urlsoapvr12: true }), 'http://erp:8829/soap/');
  assert.equal(urlAgrosys({ con_sincurl: 'http://erp:8080' }), 'http://erp:8080/wsa/wsa1/');
});

test('envelope escapa XML e a leitura devolve vdadosRetorno', () => {
  const x = montarEnvelope('u1', '{"a":"<&>"}', '');
  assert.match(x, /<vdadosParam>\{&quot;a&quot;:&quot;&lt;&amp;&gt;&quot;\}<\/vdadosParam>/);
  assert.equal(lerEnvelope('<a:vdadosRetorno xmlns:a="x">{&quot;k&quot;:1}</a:vdadosRetorno>'), '{"k":1}');
  assert.throws(() => lerEnvelope('<s:Fault><errorMessage>erro x</errorMessage></s:Fault>'), /erro x/);
  assert.throws(() => lerEnvelope('<x/>'), ErroSoap);
});

test('operacao: parametros com empresa/unidade/filial e retorno cru', async () => {
  pedidos.length = 0;
  respostas.PDVCLIENTE = () => ok([{ tp_clifor: [{ cli_codigo: 7 }] }]);
  const r = await new ProviderAgrosys(cfg()).operacao('PDVCLIENTE', { parametros: { 'cli-codigo': 7 } });
  assert.equal(r.ok, true);
  assert.deepEqual(r.tabelas.clifor, [{ cli_codigo: 7 }]);
  assert.equal(pedidos[0].path, '/wsa/wsa1/');
  assert.deepEqual(pedidos[0].param, { 'tip-operacao': 'PDVCLIENTE', 'emp-empresa': 1, 'uni-unidade': 2, 'fil-filial': 3, 'tpp-quant': 0, 'cli-codigo': 7 });
});

test('operacao de caixa usa empresa/unidade/filial _cx quando existem', async () => {
  pedidos.length = 0;
  respostas.PDVSUPCAIXA = () => ok([{ 'tp-titulo': [] }]);
  const c = configAgrosys({ con_sincurl: base, emp_empresa: 1, uni_unidade: 2, fil_filial: 3, emp_empresa_cx: 10, uni_unidade_cx: 20, fil_filial_cx: 30 });
  await new ProviderAgrosys(c).operacao('PDVSUPCAIXA');
  assert.deepEqual([pedidos[0].param['emp-empresa'], pedidos[0].param['uni-unidade'], pedidos[0].param['fil-filial']], [10, 20, 30]);
});

test('catalogo: pagina ate vir menos que o lote e para se o ERP repetir a pagina', async () => {
  pedidos.length = 0;
  let chamada = 0;
  respostas.PDVPRODUTO = () => { chamada++; return ok([{ 'tp-produto': chamada === 1 ? Array.from({ length: 100 }, (_, i) => ({ pro_codigo: i + 1 })) : [{ pro_codigo: 101 }] }]); };
  const paginas: number[] = [];
  for await (const l of new ProviderAgrosys(cfg()).catalogo('products')) paginas.push(l.length);
  assert.deepEqual(paginas, [100, 1]);
  assert.equal(pedidos[0].param['tpp-quant'], 100);

  // ERP que devolve sempre a mesma pagina cheia: nao entra em laco
  pedidos.length = 0;
  respostas.PDVPRODUTO = () => ok([{ 'tp-produto': Array.from({ length: 100 }, (_, i) => ({ pro_codigo: i + 1 })) }]);
  const so: number[] = [];
  for await (const l of new ProviderAgrosys(cfg()).catalogo('products')) so.push(l.length);
  assert.deepEqual(so, [100]);
  assert.equal(pedidos.length, 2);
});

test('catalogo: erro de negocio (codigo 9) vira ErroProvider', async () => {
  respostas.PDVCFOP = () => ({ 'tp-retorno': [{ 'msg-codigo': 9, 'msg-descricao': 'sem permissao' }] });
  await assert.rejects(async () => { for await (const _ of new ProviderAgrosys(cfg()).catalogo('fiscal-operations')) void _; }, /sem permissao/);
});

test('envios: nota so e aceita com a frase exata; caixa e e-mail com codigo 1', async () => {
  pedidos.length = 0;
  respostas.PDVNFSCAPA = () => ({ 'tp-retorno': [{ 'msg-codigo': 1, 'msg-descricao': 'x', 'msg-retorno': 'NOTA FISCAL INTEGRADA COM SUCESSO.' }] });
  const p = new ProviderAgrosys(cfg());
  const n = await p.enviar('nota', { ds: { 'tt-nfscapa': [{ nfs_numero: 1 }] } });
  assert.equal(n.ok, true);
  assert.equal(pedidos[0].receb, '{"ds":{"tt-nfscapa":[{"nfs_numero":1}]}}');

  respostas.PDVNFSCAPA = () => ({ 'tp-retorno': [{ 'msg-codigo': 1, 'msg-retorno': 'OUTRA MENSAGEM' }] });
  assert.equal((await p.enviar('nota', { ds: {} })).ok, false);

  respostas.PDVMOVCAIXA = () => ok('ok');
  assert.equal((await p.enviar('movimento-caixa', { 'tp-param': [{ ssp_movcaixa: 'SAN' }] })).ok, true);

  pedidos.length = 0;
  respostas.PDVENVEMAIL = () => ok('enviado');
  const e = await p.enviar('email', { serie: '1', numero: 55, usuario: 'joao', destino: 'a@b.c' });
  assert.equal(e.ok, true);
  assert.deepEqual([pedidos[0].param['nfs-serie'], pedidos[0].param['nfs-numero'], pedidos[0].param['ema-destino']], ['1', 55, 'a@b.c']);
});

test('falha de rede/HTTP vira ErroSoap com mensagem', async () => {
  await assert.rejects(new ProviderAgrosys(cfg()).operacao('FALHA'), /quebrou/);
  const fora = configAgrosys({ con_sincurl: 'http://127.0.0.1:1', emp_empresa: 1, uni_unidade: 1, fil_filial: 1 });
  await assert.rejects(new ProviderAgrosys(fora).operacao('PDVCLIENTE'), ErroSoap);
});

test('origem api: sem consulta em tempo real e envio fica para o cliente buscar', async () => {
  const api = criarProvider('api', {});
  assert.ok(api instanceof ProviderApi);
  await assert.rejects(api.operacao('PDVCLIENTE'), (e: unknown) => e instanceof ErroProvider && e.naoSuportado);
  assert.deepEqual((await api.enviar()).entrega, 'manual');
  assert.throws(() => configAgrosys({}), ErroProvider);
});
