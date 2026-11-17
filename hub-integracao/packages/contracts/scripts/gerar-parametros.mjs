// Gera src/parametros.generated.ts a partir de tools/hub-catalogo/parametros.json
// (extrair-parametros.js le a tela PDV/untParametros.pas). So entram os campos que
// vao para o Hub; os de config.ini (locais da maquina) ficam de fora.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, '../../../..');
const todos = JSON.parse(fs.readFileSync(path.join(raiz, 'tools/hub-catalogo/parametros.json'), 'utf8'));

// Campos que so fazem sentido quando a origem da empresa e o Agrosys.
const SO_AGROSYS = new Set([
  'emp_empresa', 'uni_unidade', 'fil_filial', 'emp_empresa_hlg', 'uni_unidade_hlg', 'fil_filial_hlg',
  'emp_empresa_cx', 'uni_unidade_cx', 'fil_filial_cx', 'con_sincurl', 'cai_urlsoapvr12', 'cai_timeout',
]);

const campos = todos.filter((c) => !c.local).map((c) => {
  const o = {
    campo: c.campo, rotulo: c.rotulo, grupo: c.grupo, subgrupo: c.subgrupo || undefined,
    bloco: c.blocoVisual || undefined, largura: c.largura || 100,
    controle: c.controle, tipo: c.tipo,
  };
  if (c.controle === 'minmax') { o.minimo = c.minimo; o.maximo = c.maximo; o.padrao = c.padrao; }
  if (c.extensoes) o.extensoes = c.extensoes;
  if (c.opcoes) { o.opcoes = c.opcoes; o.valorPorIndice = Boolean(c.valorPorIndice); }
  if (c.listaDoDispositivo) o.listaDoDispositivo = true;
  if (SO_AGROSYS.has(c.campo)) o.origem = 'agrosys';
  return o;
});

fs.writeFileSync(path.join(aqui, '../src/parametros.generated.ts'),
`// GERADO por scripts/gerar-parametros.mjs - nao editar.
import type { ParametroDef } from './parametros';

export const parametros: readonly ParametroDef[] = ${JSON.stringify(campos, null, 1)};
`);
console.log(`${campos.length} parametros (${campos.filter((c) => c.origem).length} so Agrosys)`);
