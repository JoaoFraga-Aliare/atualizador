// Copia os dados do banco SQLite antigo (better-sqlite3) para o Postgres novo.
// Uso:
//   DATABASE_URL=postgres://... node scripts/migrate-sqlite-to-postgres.js [caminho/para/updater.db]
//
// Roda uma unica vez, por tabela, na ordem das chaves estrangeiras; ao final ajusta as sequences
// dos ids (serial) para continuarem depois do maior id migrado. E seguro rodar de novo: cada tabela
// e truncada (CASCADE) antes de receber os dados outra vez.
import 'dotenv/config';
import path from 'node:path';
import Database from 'better-sqlite3';
import { openDatabase, migrate } from '../src/db.js';

const sqlitePath = path.resolve(process.argv[2] || process.env.DATABASE_PATH || './data/updater.db');

// Ordem de dependencia (FKs): uma tabela so aparece depois das que ela referencia.
const TABLES = [
  'product',
  'app_user',
  'client',
  'terminal',
  'release',
  'ci_artifact',
  'release_target',
  'terminal_event',
  'terminal_database_request',
  'terminal_database_upload',
  'terminal_live_event',
  'application_error',
  'error_rule',
  'user_product',
  'user_channel',
  'api_token_product',
  'api_token_channel',
  'notification_read',
  'product_theme',
  'admin_session',
  'api_token',
  'api_token_item_product',
  'api_token_item_channel',
  'ci_artifact_channel',
  'hub_user_tenant',
  'hub_user_profile'
];
// Tabelas-singleton: a migracao de esquema (001_base.sql) ja insere a linha id=1; aqui so atualiza.
const SINGLETONS = new Set(['terminal_database_setting', 'error_setting']);

async function main() {
  console.log(`Lendo SQLite: ${sqlitePath}`);
  const sqlite = new Database(sqlitePath, { readonly: true });
  const db = openDatabase(process.env.DATABASE_URL);
  console.log('Aplicando migracoes do Postgres (se houver alguma pendente)...');
  await migrate(db);

  for (const table of [...TABLES, ...SINGLETONS]) {
    const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
    if (!rows.length) {
      console.log(`${table}: 0 linhas (nada a copiar)`);
      continue;
    }
    const columns = Object.keys(rows[0]);
    if (SINGLETONS.has(table)) {
      const sets = columns.filter(c => c !== 'id').map(c => `${c}=?`).join(',');
      const values = columns.filter(c => c !== 'id');
      const row = rows[0];
      await db.prepare(`UPDATE ${table} SET ${sets} WHERE id=1`).run(...values.map(c => row[c]));
    } else {
      await db.prepare(`TRUNCATE ${table} CASCADE`).run();
      const placeholders = columns.map(() => '?').join(',');
      const insert = db.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${placeholders})`);
      for (const row of rows) await insert.run(...columns.map(c => row[c]));
      if (columns.includes('id')) {
        const seq = (await db.prepare(`SELECT pg_get_serial_sequence('${table}','id') AS seq`).get()).seq;
        if (seq) await db.prepare(`SELECT setval('${seq}',(SELECT COALESCE(MAX(id),1) FROM ${table}))`).get();
      }
    }
    console.log(`${table}: ${rows.length} linha(s) copiada(s)`);
  }

  sqlite.close();
  await db.pool.end();
  console.log('Migracao concluida.');
}

main().catch(e => {
  console.error('Falha na migracao:', e);
  process.exit(1);
});
