// Gera src/entities.generated.ts a partir de docs/hub/catalogo.json (fase 1) e
// tools/hub-catalogo/chaves.json (chaves primarias reais do banco).
// Nomes de campo = nomes de coluna do terminal (renomeacao canonica e uma fase futura).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const catalogo = JSON.parse(fs.readFileSync(path.join(raiz, 'docs/hub/catalogo.json'), 'utf8'));
const chaves = JSON.parse(fs.readFileSync(path.join(raiz, 'tools/hub-catalogo/chaves.json'), 'utf8'));

const zodDe = (c) => {
  const t = c.tipo;
  let z;
  if (/^(integer|smallint|bigint)$/.test(t)) z = 'z.coerce.number().int()';
  else if (/^(numeric|double precision|real|money)$/.test(t)) z = 'z.coerce.number()';
  else if (t === 'boolean') z = 'z.union([z.boolean(), z.enum(["yes","no"]).transform((v) => v === "yes")])';
  else z = 'z.string()';
  return z + '.nullable().optional()';
};

// Tabelas sem PK no banco: chave unica conferida nos dados do banco de teste (sem duplicidade).
const CHAVES_CONFERIDAS = {
  users: ['usu_usuario'], operations: ['ope_codigo'], 'fiscal-operations': ['nat_codigo'],
  'operation-fiscal-links': ['seq'], 'cfop-table': ['seq'], creditors: ['cre_codigo'], 'sales-reps': ['rvd_codigo'],
};
// Sem dados para conferir (tabela vazia no banco de teste): chave composta provavel; a confirmar.
const CHAVES_ASSUMIDAS = { 'volume-prices': ['emp_empresa', 'uni_unidade', 'ite_codigo', 'dtvig', 'pre_tiporeg', 'qtini'] };
const vistas = new Set();
const saida = [];
const semPk = [];
for (const op of catalogo.operacoes) {
  if (op.categoria !== 'catalogo' || vistas.has(op.canonico)) continue;
  // Parametros do caixa sao configurados no Hub (parametros.generated.ts), nao vem do ERP.
  if (op.canonico === 'terminal-settings') continue;
  const tabela = op.tabelas[0];
  const colunas = catalogo.entidades[tabela];
  if (!tabela || !colunas) continue;
  vistas.add(op.canonico);

  let pk = chaves[tabela]?.primary ?? [];
  if (pk.length === 0 && CHAVES_CONFERIDAS[op.canonico]) pk = CHAVES_CONFERIDAS[op.canonico];
  else if (pk.length === 0 && CHAVES_ASSUMIDAS[op.canonico]) { pk = CHAVES_ASSUMIDAS[op.canonico]; semPk.push(op.canonico); }
  else if (pk.length === 0) { pk = [op.chave]; semPk.push(op.canonico); }

  const campos = colunas.map((c) => {
    const obrig = pk.includes(c.coluna);
    return `    ${JSON.stringify(c.coluna)}: ${obrig ? zodDe(c).replace('.nullable().optional()', '') : zodDe(c)},`;
  }).join('\n');

  saida.push(`  ${JSON.stringify(op.canonico)}: {
    nome: ${JSON.stringify(op.canonico)},
    operacaoLegada: ${JSON.stringify(op.op)},
    tabelaLegada: ${JSON.stringify(tabela)},
    chave: ${JSON.stringify(pk)} as const,
    chaveConfirmada: ${!semPk.includes(op.canonico)},
    schema: z.object({
${campos}
    }).passthrough(),
  },`);
}

fs.writeFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/entities.generated.ts'),
`// GERADO por scripts/gerar-entidades.mjs - nao editar.
import { z } from 'zod';

export const entidades = {
${saida.join('\n')}
} as const;

export type NomeEntidade = keyof typeof entidades;
`);
console.log(`${saida.length} entidades; chave a confirmar (sem PK no banco): ${semPk.join(', ')}`);
