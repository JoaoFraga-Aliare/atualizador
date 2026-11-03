import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { inject } from 'vitest';
import { criarApp } from '../src/app.js';
import { carregarConfig } from '../src/config.js';
import { comAdmin, criarPool } from '../src/db.js';
import { emitirToken } from '../src/seguranca/tokens.js';

export const CHAVE_TESTE = Buffer.alloc(32, 7).toString('base64');

export async function iniciar() {
  const pool = criarPool(inject('urlApp'));
  const config = carregarConfig({
    NODE_ENV: 'test',
    DATABASE_URL: inject('urlApp'),
    SEGREDOS_CHAVE: CHAVE_TESTE,
  });
  const app: FastifyInstance = await criarApp(config, pool);
  return { app, pool, fechar: async () => { await app.close(); await pool.end(); } };
}

/** Cria empresa com N caixas e tokens (empresa + um por caixa), via papel admin da aplicação. */
export async function criarEmpresa(pool: pg.Pool, caixas = 2) {
  return comAdmin(pool, async (c) => {
    const cnpj = String(Math.floor(Math.random() * 1e14)).padStart(14, '0');
    const e = await c.query(
      `INSERT INTO empresa (razao_social, cnpj, cota_caixas) VALUES ($1, $2, $3) RETURNING id`,
      [`Empresa ${cnpj}`, cnpj, caixas],
    );
    const empresaId: string = e.rows[0].id;
    const tokenEmpresa = await emitirToken(c, { tipo: 'empresa', empresaId });
    const cx = [];
    for (let i = 1; i <= caixas; i++) {
      const r = await c.query(
        `INSERT INTO caixa (empresa_id, codigo, serie_nfce) VALUES ($1, $2, $3) RETURNING id`,
        [empresaId, i, String(i)],
      );
      const t = await emitirToken(c, { tipo: 'caixa', empresaId, caixaId: r.rows[0].id });
      cx.push({ id: r.rows[0].id as string, codigo: i, token: t });
    }
    return { empresaId, tokenEmpresa, caixas: cx };
  });
}

export const auth = (valor: string) => ({ authorization: `Bearer ${valor}` });
export const novoUuid = randomUUID;
