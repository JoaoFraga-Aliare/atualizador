import type { FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { ContextoTenant } from './db.js';
import { ESCOPOS, hashToken } from './seguranca/tokens.js';

export interface Identidade extends ContextoTenant {
  tokenId: string;
  escopos: readonly string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    identidade?: Identidade;
  }
}

/** Resposta única para qualquer falha de autenticação (não revela se o token existe/foi revogado). */
const NAO_AUTORIZADO = { erro: 'nao_autorizado', mensagem: 'Token inválido ou revogado.' };

export function exigirToken(pool: pg.Pool, escopo: string) {
  return async function (req: FastifyRequest, reply: FastifyReply) {
    const cab = req.headers.authorization;
    const m = typeof cab === 'string' ? /^Bearer (\S{20,200})$/.exec(cab) : null;
    if (!m) return reply.code(401).send(NAO_AUTORIZADO);

    const r = await pool.query('SELECT * FROM hub_buscar_token($1)', [hashToken(m[1]!)]);
    const t = r.rows[0];
    if (!t || !t.valido) return reply.code(401).send(NAO_AUTORIZADO);

    const escopos = ESCOPOS[t.tipo as 'empresa' | 'caixa'];
    if (!escopos.includes(escopo)) {
      return reply.code(403).send({ erro: 'escopo_insuficiente', mensagem: `Requer o escopo ${escopo}.` });
    }
    req.identidade = { tokenId: t.id, empresaId: t.empresa_id, caixaId: t.caixa_id, papel: t.tipo, escopos };
  };
}
