import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// count(*)/bigint (oid 20) chega como string por padrao (evita perda de precisao acima de 2^53);
// o codigo trata esses valores como number comum. timestamptz (oid 1184) vira string ISO-8601 (como
// no SQLite), em vez do objeto Date que o driver devolveria por padrao: o resto do codigo usa
// metodos de string (slice/replace) e comparacoes textuais nessas colunas.
pg.types.setTypeParser(20, v => Number(v));
const parseTimestamptz = pg.types.getTypeParser(1184);
pg.types.setTypeParser(1184, v => parseTimestamptz(v).toISOString());

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');

// Converte os placeholders "?" (estilo better-sqlite3, usado em todo o codigo) para "$1,$2,..." (Postgres).
function toPgSql(sql) {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

// Mesma forma de uso do better-sqlite3 (db.prepare(sql).get/all/run(...params)), so que assincrona:
// toda chamada precisa de "await". run() devolve lastInsertRowid quando o SQL tiver "RETURNING id".
function makeDb(executor) {
  return {
    prepare(sql) {
      const pgSql = toPgSql(sql);
      return {
        async get(...params) {
          const r = await executor.query(pgSql, params);
          return r.rows[0];
        },
        async all(...params) {
          const r = await executor.query(pgSql, params);
          return r.rows;
        },
        async run(...params) {
          const r = await executor.query(pgSql, params);
          return { changes: r.rowCount, lastInsertRowid: r.rows[0]?.id };
        }
      };
    },
    // Roda fn(tdb, ...args) dentro de uma unica transacao (BEGIN/COMMIT/ROLLBACK); tdb deve ser usado
    // no lugar do db externo para toda leitura/escrita que precisa ver o estado ainda nao comitado.
    transaction(fn) {
      return async (...args) => {
        if (typeof executor.connect !== 'function')
          throw new Error('transaction() so pode ser chamado a partir do pool, nao de dentro de outra transacao');
        const c = await executor.connect();
        try {
          await c.query('BEGIN');
          const result = await fn(makeDb(c), ...args);
          await c.query('COMMIT');
          return result;
        } catch (e) {
          await c.query('ROLLBACK');
          throw e;
        } finally {
          c.release();
        }
      };
    },
    // Para transacoes manuais (BEGIN/COMMIT/ROLLBACK espalhados por um handler, nao num unico fn):
    // tira uma conexao dedicada do pool; quem chamar precisa liberar com tdb.release() ao final.
    async connect() {
      if (typeof executor.connect !== 'function') throw new Error('connect() so pode ser chamado a partir do pool');
      const c = await executor.connect();
      const tdb = makeDb(c);
      tdb.exec = sql => c.query(sql);
      tdb.release = () => c.release();
      return tdb;
    }
  };
}

export function openDatabase(connectionString) {
  // Fuso UTC fixo na conexao: o restante do codigo grava/compara CURRENT_TIMESTAMP/now() e strings ISO
  // (herdado do SQLite, que gravava tudo em UTC sem sufixo) assumindo sempre UTC, nunca o fuso da sessao.
  const pool = new pg.Pool({ connectionString, max: 10, options: '-c TimeZone=UTC' });
  return { ...makeDb(pool), pool };
}

// Roda as migracoes pendentes (uma unica vez cada, em ordem, numa transacao por arquivo).
export async function migrate(db) {
  const pool = db.pool;
  await pool.query(
    'CREATE TABLE IF NOT EXISTS _migrations(nome TEXT PRIMARY KEY, aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now())'
  );
  const feitas = new Set((await pool.query('SELECT nome FROM _migrations')).rows.map(r => r.nome));
  const aplicadas = [];
  for (const arquivo of fs
    .readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()) {
    if (feitas.has(arquivo)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, arquivo), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations(nome) VALUES($1)', [arquivo]);
      await client.query('COMMIT');
      aplicadas.push(arquivo);
    } catch (e) {
      await client.query('ROLLBACK');
      throw new Error(`migracao ${arquivo} falhou: ${e.message}`);
    } finally {
      client.release();
    }
  }
  return aplicadas;
}
