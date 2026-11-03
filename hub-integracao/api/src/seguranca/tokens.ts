import { createHash, randomBytes } from 'node:crypto';
import type pg from 'pg';
import type { Papel } from '../db.js';

export const PREFIXO_TOKEN: Record<Papel, string> = { empresa: 'hub_emp_', caixa: 'hub_cx_' };

/** Escopos concedidos por tipo de token (empresa escreve cadastros; caixa lê cadastros e envia movimento). */
export const ESCOPOS: Record<Papel, readonly string[]> = {
  empresa: ['cadastros:ler', 'cadastros:escrever'],
  caixa: ['cadastros:ler', 'movimento:escrever'],
};

export function hashToken(valor: string): Buffer {
  return createHash('sha256').update(valor, 'utf8').digest();
}

/**
 * Gera um token novo. O valor em claro é devolvido UMA vez; no banco fica só o hash.
 * Deve ser chamado dentro de comAdmin (RLS exige admin para escrever em token_acesso).
 */
export async function emitirToken(
  c: pg.PoolClient,
  p: { tipo: Papel; empresaId: string; caixaId?: string; descricao?: string; expiraEm?: Date },
): Promise<{ id: string; valor: string }> {
  const valor = PREFIXO_TOKEN[p.tipo] + randomBytes(32).toString('base64url');
  const r = await c.query<{ id: string }>(
    `INSERT INTO token_acesso (tipo, empresa_id, caixa_id, hash, prefixo, descricao, expira_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [p.tipo, p.empresaId, p.caixaId ?? null, hashToken(valor), valor.slice(0, 12), p.descricao ?? null, p.expiraEm ?? null],
  );
  return { id: r.rows[0]!.id, valor };
}

export async function revogarToken(c: pg.PoolClient, id: string): Promise<void> {
  await c.query('UPDATE token_acesso SET revogado_em = now() WHERE id = $1 AND revogado_em IS NULL', [id]);
}

/** Rotação: emite um novo token equivalente e revoga o antigo na mesma transação. */
export async function rotacionarToken(c: pg.PoolClient, id: string): Promise<{ id: string; valor: string }> {
  const r = await c.query(
    'SELECT tipo, empresa_id, caixa_id, descricao FROM token_acesso WHERE id = $1 AND revogado_em IS NULL',
    [id],
  );
  const t = r.rows[0];
  if (!t) throw new Error('token inexistente ou já revogado');
  const novo = await emitirToken(c, { tipo: t.tipo, empresaId: t.empresa_id, caixaId: t.caixa_id ?? undefined, descricao: t.descricao ?? undefined });
  await revogarToken(c, id);
  return novo;
}
