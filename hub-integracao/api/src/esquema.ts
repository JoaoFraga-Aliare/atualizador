import type pg from 'pg';

/** Colunas que o cliente nunca informa: controladas pelo Hub. */
const RESERVADAS = new Set(['empresa_id', 'caixa_id', 'id', 'recebido_em', 'hub_id', 'hub_versao', 'hub_atualizado_em']);

export interface InfoTabela {
  nome: string;
  tipo: 'cadastro' | 'movimento';
  colunas: string[]; // colunas aceitas do cliente
  chave: string[]; // PK original (sem empresa_id)
  /** Expressão SQL de seleção por coluna: aplica o DEFAULT do banco em colunas NOT NULL quando o campo não vem. */
  selecao: Record<string, string>;
}

/**
 * Descobre, pelo catálogo do Postgres, as tabelas espelhadas: têm coluna empresa_id e hub_versao.
 * Movimento = tem caixa_id. Só tabelas descobertas aqui podem ser acessadas pelas rotas genéricas
 * (lista fechada; o nome da tabela do cliente nunca vai direto ao SQL).
 */
export async function carregarEsquema(pool: pg.Pool): Promise<Map<string, InfoTabela>> {
  const cols = await pool.query<{ t: string; c: string; usa_default: boolean; d: string | null }>(`
    SELECT table_name t, column_name c, is_nullable = 'NO' AND column_default IS NOT NULL AS usa_default, column_default d
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name IN (
       SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'hub_versao')
     ORDER BY table_name, ordinal_position`);
  const pks = await pool.query<{ t: string; c: string }>(`
    SELECT cl.relname t, a.attname c
      FROM pg_index i JOIN pg_class cl ON cl.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
      JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum = ANY (i.indkey)
     WHERE i.indisprimary`);
  const mapa = new Map<string, InfoTabela>();
  for (const { t, c, usa_default, d } of cols.rows) {
    const info = mapa.get(t) ?? { nome: t, tipo: 'cadastro' as const, colunas: [], chave: [], selecao: {} };
    if (c === 'caixa_id') info.tipo = 'movimento';
    if (!RESERVADAS.has(c)) {
      info.colunas.push(c);
      info.selecao[c] = usa_default && d ? `coalesce(${ident(c)}, ${d})` : ident(c);
    }
    mapa.set(t, info);
  }
  for (const { t, c } of pks.rows) {
    const info = mapa.get(t);
    if (info && !RESERVADAS.has(c)) info.chave.push(c);
  }
  return mapa;
}

/** Identificador SQL entre aspas (nomes vêm do catálogo, mas citamos por garantia). */
export const ident = (s: string) => '"' + s.replace(/"/g, '""') + '"';
