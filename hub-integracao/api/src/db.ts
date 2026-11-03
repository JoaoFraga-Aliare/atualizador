import pg from 'pg';

export type Papel = 'empresa' | 'caixa';

/** Contexto de tenant aplicado às policies de RLS (ver migration 0001). */
export interface ContextoTenant {
  empresaId: string;
  caixaId?: string | null;
  papel: Papel;
}

export function criarPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, max: 10 });
}

/**
 * Executa fn numa transação com o tenant definido (set_config local à transação).
 * Todo acesso a tabelas com RLS deve passar por aqui.
 */
export async function comTenant<T>(
  pool: pg.Pool,
  ctx: ContextoTenant,
  fn: (c: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(
      `SELECT set_config('app.empresa_id', $1, true),
              set_config('app.caixa_id', $2, true),
              set_config('app.papel', $3, true)`,
      [ctx.empresaId, ctx.caixaId ?? '', ctx.papel],
    );
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

/** Para o painel do admin: ignora o filtro de tenant (a autorização por vínculo é feita na aplicação). */
export async function comAdmin<T>(pool: pg.Pool, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SELECT set_config('app.admin', '1', true), set_config('app.papel', 'usuario', true)`);
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}
