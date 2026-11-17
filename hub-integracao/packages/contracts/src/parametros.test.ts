import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parametros, validarParametros, gruposDe, parametroDe } from './index';

test('catalogo extraido da tela do PDV', () => {
  assert.ok(parametros.length > 130);
  assert.ok(gruposDe('agrosys').includes('Sincronização'));
  assert.ok(!parametros.some((p) => p.campo.startsWith('INI|')), 'campos de config.ini nao vao para o Hub');
  assert.equal(parametroDe('pdv_sincsangriasup')?.tipo, 'booleano');
});

test('empresa com origem api nao ve campos so do Agrosys', () => {
  assert.ok(!gruposDe('api').includes('Sincronização') || parametros.some((p) => p.grupo === 'Sincronização' && !p.origem));
  const r = validarParametros({ con_sincurl: 'http://x' }, 'api');
  assert.equal(r.erros.length, 1);
  assert.equal(validarParametros({ con_sincurl: 'http://x' }, 'agrosys').erros.length, 0);
});

test('tipos: booleano, inteiro, lista, data', () => {
  const ok = validarParametros({ pdv_sincsangriasup: true, cai_timeout: '5000', con_uf: 'SP' }, 'agrosys');
  assert.deepEqual(ok.erros, []);
  assert.equal(ok.valores.cai_timeout, 5000);
  assert.ok(validarParametros({ pdv_sincsangriasup: 'sim' }, 'agrosys').erros.length);
  assert.ok(validarParametros({ con_uf: 'XX' }, 'agrosys').erros.length);
  assert.ok(validarParametros({ cai_datacont: '29/10/2026' }, 'agrosys').erros.length);
  assert.deepEqual(validarParametros({ cai_datacont: '2026-10-29' }, 'agrosys').erros, []);
  assert.ok(validarParametros({ campo_que_nao_existe: 1 }, 'agrosys').erros.length);
  assert.equal(validarParametros({ cai_loja: null }, 'agrosys').valores.cai_loja, null);
});

test('lista gravada por indice valida o intervalo', () => {
  assert.deepEqual(validarParametros({ cai_viacliente: 2 }, 'agrosys').erros, []);
  assert.ok(validarParametros({ cai_viacliente: 7 }, 'agrosys').erros.length);
});
