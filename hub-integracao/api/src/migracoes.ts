import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

/**
 * Migrations versionadas: arquivos migrations/NNNN_nome.sql aplicados em ordem, cada um numa transação.
 * O checksum impede alterar uma migration já aplicada.
 */
export async function migrar(
  urlDono: string,
  dir: string,
  log: (m: string) => void = console.log,
): Promise<string[]> {
  const c = new pg.Client({ connectionString: urlDono });
  await c.connect();
  const aplicadas: string[] = [];
  try {
    await c.query('SELECT pg_advisory_lock(727274)');
    await c.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      nome text PRIMARY KEY, checksum text NOT NULL, aplicada_em timestamptz NOT NULL DEFAULT now())`);
    const feitas = new Map(
      (await c.query<{ nome: string; checksum: string }>('SELECT nome, checksum FROM schema_migrations')).rows.map(
        (r) => [r.nome, r.checksum],
      ),
    );
    const arquivos = readdirSync(dir).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
    for (const arq of arquivos) {
      const sql = readFileSync(join(dir, arq), 'utf8');
      const checksum = createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
      const anterior = feitas.get(arq);
      if (anterior) {
        if (anterior !== checksum) throw new Error(`Migration ${arq} foi alterada depois de aplicada`);
        continue;
      }
      try {
        await c.query('BEGIN');
        await c.query(sql);
        await c.query('INSERT INTO schema_migrations (nome, checksum) VALUES ($1, $2)', [arq, checksum]);
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK').catch(() => undefined);
        throw new Error(`Falha em ${arq}: ${(e as Error).message}`);
      }
      log(`migration aplicada: ${arq}`);
      aplicadas.push(arq);
    }
  } finally {
    await c.query('SELECT pg_advisory_unlock(727274)').catch(() => undefined);
    await c.end();
  }
  return aplicadas;
}
