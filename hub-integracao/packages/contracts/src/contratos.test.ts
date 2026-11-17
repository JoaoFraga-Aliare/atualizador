import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contratos, schemaExterno, paraLegado, paraExterno, verificarContrato, entidades, chaveDaLinha, contratoPorCaminho } from './index';

test('todo contrato e coerente com o catalogo (colunas existem, chaves obrigatorias)', () => {
  const erros = contratos.flatMap((c) => verificarContrato(c));
  assert.deepEqual(erros, []);
  assert.equal(new Set(contratos.map((c) => c.caminho)).size, contratos.length);
});

test('o exemplo de cada contrato vale: passa na validacao externa e vira linha valida do terminal', () => {
  for (const c of contratos) {
    const ext = schemaExterno(c).safeParse(c.exemplo);
    assert.equal(ext.success, true, `${c.caminho}: ${JSON.stringify(ext.success ? '' : ext.error.issues)}`);
    const legado = paraLegado(c, ext.data as Record<string, unknown>);
    const ent = entidades[c.entidade];
    assert.equal(ent.schema.safeParse(legado).success, true, `${c.caminho}: linha legada invalida`);
    assert.doesNotThrow(() => chaveDaLinha(legado, ent.chave), `${c.caminho}: chave ausente`);
  }
});

test('ativo 0/1 vira boolean no terminal (exemplo do CFOP) e volta', () => {
  const c = contratoPorCaminho('fiscal-operation')!;
  assert.deepEqual(paraLegado(c, { codigo: 5102, descricao: 'Venda', ativo: 1 }), { nat_codigo: 5102, nat_descrnatope: 'Venda', nat_ativa: true });
  assert.equal(paraLegado(c, { codigo: 1, ativo: 0 }).nat_ativa, false);
  assert.deepEqual(paraExterno(c, { nat_codigo: '5102', nat_ativa: true, nat_devcli: false }), { codigo: 5102, ativo: 1, devolucaoCliente: 0 });
  // so 0 ou 1
  assert.equal(schemaExterno(c).safeParse({ codigo: 1, ativo: 2 }).success, false);
  assert.equal(schemaExterno(c).safeParse({ codigo: 1, ativo: true }).success, false);
});

test('simnao converte para yes/no do terminal', () => {
  const c = contratoPorCaminho('payment-term')!;
  const l = paraLegado(c, { codigo: '30', ativo: 1, disponivelPdv: 0 });
  assert.deepEqual([l.cpg_situac, l.cpg_pdv], ['yes', 'no']);
});

test('contrato e estrito: campo desconhecido, chave ausente e tamanho excedido sao recusados', () => {
  const c = contratoPorCaminho('brand')!;
  const s = schemaExterno(c);
  assert.equal(s.safeParse({ codigo: 1, mar_descricao: 'x' }).success, false);      // nome legado nao vale no contrato
  assert.equal(s.safeParse({ descricao: 'sem codigo' }).success, false);
  assert.equal(s.safeParse({ codigo: 1, descricao: 'x'.repeat(71) }).success, false);
  assert.equal(s.safeParse({ codigo: 1 }).success, true);
});

test('chave composta (agencia bancaria e preco) exige todas as partes', () => {
  const c = contratoPorCaminho('price')!;
  assert.equal(schemaExterno(c).safeParse({ produto: 1, valor: 10 }).success, false);
  assert.equal(schemaExterno(c).safeParse({ tabelaPreco: 1, produto: 1, valor: 10 }).success, true);
});
