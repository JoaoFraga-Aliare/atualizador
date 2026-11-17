import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entidades } from '@hub/contracts';
import { linhasDaEntidade, lerRetorno, montarRequisicao, pedidoDaEntidade } from './agrosys';

test('requisicao tem o formato tp-param que o Agrosys espera', () => {
  const txt = montarRequisicao({ empresa: 1, unidade: 2, filial: 3 },
    { operacao: 'PDVPRECO', quantidade: 360, extras: { 'pre-tiporeg': '1' } });
  assert.deepEqual(JSON.parse(txt), { 'tp-param': [{
    'tip-operacao': 'PDVPRECO', 'emp-empresa': 1, 'uni-unidade': 2, 'fil-filial': 3, 'tpp-quant': 360, 'pre-tiporeg': '1',
  }] });
});

test('retorno ok: msg-retorno como array com tp-<tabela>', () => {
  const r = lerRetorno(JSON.stringify({ 'tp-retorno': [{
    'msg-codigo': 1, 'msg-descricao': 'ok',
    'msg-retorno': [{ 'tp-cimarca': [{ mar_codigo: 1, mar_descricao: 'A' }, { mar_codigo: 2, mar_descricao: 'B' }] }],
  }] }));
  assert.equal(r.ok, true);
  assert.equal(linhasDaEntidade(r, 'brands').length, 2);
});

test('retorno ok: msg-retorno como string JSON e prefixo tp_ (clifor)', () => {
  const r = lerRetorno(JSON.stringify({ 'tp-retorno': [{
    'msg-codigo': 1, 'msg-retorno': JSON.stringify({ tp_clifor: [{ cli_codigo: 7 }] }),
  }] }));
  assert.deepEqual(r.tabelas.clifor, [{ cli_codigo: 7 }]);
});

test('erro de negocio (codigo 9) nao devolve tabelas', () => {
  const r = lerRetorno(JSON.stringify({ 'tp-retorno': [{ 'msg-codigo': 9, 'msg-descricao': 'Sem saldo' }] }));
  assert.equal(r.ok, false);
  assert.equal(r.descricao, 'Sem saldo');
  assert.deepEqual(r.tabelas, {});
});

test('retorno invalido levanta erro', () => {
  assert.throws(() => lerRetorno('{"x":1}'));
});

test('pedido da entidade usa a operacao legada do catalogo', () => {
  assert.equal(pedidoDaEntidade('fiscal-operations').operacao, 'PDVCFOP');
  assert.equal(entidades['fiscal-operations'].tabelaLegada, 'natoperacao');
});
