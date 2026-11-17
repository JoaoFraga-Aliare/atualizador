import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonico, hashLinha, chaveDaLinha, entidades } from './index';

test('hash ignora ordem das chaves, espacos e null/ausente', () => {
  const a = { b: ' x ', a: 1, c: null };
  const b = { a: 1, b: 'x' };
  assert.equal(hashLinha(a), hashLinha(b));
  assert.equal(canonico(a), '{"a":1,"b":"x"}');
});

test('hash muda quando um valor muda', () => {
  assert.notEqual(hashLinha({ a: 1 }), hashLinha({ a: 2 }));
});

test('chave composta e obrigatoria', () => {
  assert.equal(chaveDaLinha({ pre_tiporeg: 1, ite_codigo: 5 }, ['pre_tiporeg', 'ite_codigo']), '1|5');
  assert.throws(() => chaveDaLinha({ pre_tiporeg: 1 }, ['pre_tiporeg', 'ite_codigo']));
});

test('catalogo gerado tem produto e preco com chave real do banco', () => {
  assert.deepEqual([...entidades.products.chave], ['pro_codigo']);
  assert.deepEqual([...entidades.prices.chave], ['pre_tiporeg', 'ite_codigo']);
  const r = entidades.products.schema.safeParse({ pro_codigo: '12', pro_descricao: 'X' });
  assert.equal(r.success, true);
});
