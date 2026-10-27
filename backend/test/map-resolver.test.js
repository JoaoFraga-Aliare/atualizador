import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMap, resolveAddress, exceptionHints } from '../src/map-resolver.js';

const MAP = `
 Start         Length     Name                   Class
 0001:00401000 00001000H .text                   CODE

Detailed map of segments

 0001:00000000 00000100 C=CODE     S=.text    G=(none)   M=System ACBP=A9
 0001:00000100 00000200 C=CODE     S=.text    G=(none)   M=untVenda ACBP=A9

  Address         Publics by Name

 0001:00000010       System.Halt
 0001:00000120       untVenda.TVenda.Fechar
 0001:00000200       untVenda.TVenda.Cancelar

Line numbers for untVenda(untVenda.pas) segment .text

    10 0001:00000120    11 0001:00000130    12 0001:00000150
    20 0001:00000200
`;

test('resolve endereço do Delphi para unit, procedure e linha', () => {
  const map = parseMap(MAP);
  const r = resolveAddress(map, '00401135');
  assert.equal(r.unit, 'untVenda');
  assert.equal(r.procedure, 'untVenda.TVenda.Fechar');
  assert.equal(r.line, 11);
  assert.equal(r.file, 'untVenda.pas');
});

test('endereço de retorno usa a instrução anterior e fora do mapa retorna null', () => {
  const map = parseMap(MAP);
  assert.equal(resolveAddress(map, '00401200', { returnAddress: true }).procedure, 'untVenda.TVenda.Fechar');
  assert.equal(resolveAddress(map, '00409999'), null);
});

test('dicas por classe de exceção', () => {
  assert.match(exceptionHints('EAccessViolation', '')[0], /nil/);
  assert.deepEqual(exceptionHints('EOutraCoisa', 'x'), []);
});
