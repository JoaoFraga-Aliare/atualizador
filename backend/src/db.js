import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
// Cada passo roda uma unica vez, em ordem e numa transacao; PRAGMA user_version guarda o ultimo aplicado.
// Para mudar o esquema, acrescente um passo no fim da lista; nunca altere um passo ja publicado.
const MIGRATIONS = [
  { version: 1, name: 'esquema base', up: baseSchema },
  { version: 2, name: 'corrige acentuacao das mensagens de eventos', up: fixEventMessageEncoding },
  {
    version: 3,
    name: 'chave propria por terminal',
    up: db =>
      db.exec(`
        ALTER TABLE terminal ADD COLUMN api_key_hash TEXT;
        ALTER TABLE terminal ADD COLUMN api_key_issued_at TEXT;
        ALTER TABLE terminal ADD COLUMN api_key_confirmed_at TEXT;
        CREATE UNIQUE INDEX idx_terminal_api_key ON terminal(api_key_hash) WHERE api_key_hash IS NOT NULL;
      `)
  },
  {
    version: 4,
    name: 'sessoes revogaveis do painel',
    up: db =>
      db.exec(`
        CREATE TABLE admin_session(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,expires_at TEXT NOT NULL,revoked_at TEXT,ip TEXT,user_agent TEXT,FOREIGN KEY(user_id) REFERENCES app_user(id) ON DELETE CASCADE);
        CREATE INDEX idx_admin_session_user ON admin_session(user_id,revoked_at);
      `)
  },
  {
    version: 5,
    name: 'liberacao gradual das publicacoes',
    up: db => db.exec('ALTER TABLE release ADD COLUMN rollout_percent INTEGER NOT NULL DEFAULT 100')
  },
  {
    version: 6,
    name: 'hash do executavel instalado por terminal',
    up: db =>
      db.exec(`
        ALTER TABLE terminal ADD COLUMN executable_sha256 TEXT;
        ALTER TABLE terminal ADD COLUMN executable_status TEXT;
      `)
  },
  {
    version: 7,
    name: 'usuarios do Hub (desenvolvedores) e vinculo com clientes do Hub',
    up: db =>
      db.exec(`
        ALTER TABLE app_user ADD COLUMN hub_role TEXT CHECK(hub_role IS NULL OR hub_role='developer');
        CREATE TABLE hub_user_tenant(user_id INTEGER NOT NULL,tenant_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('homologation','client')),approved_at TEXT,approved_by INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,tenant_id),FOREIGN KEY(user_id) REFERENCES app_user(id) ON DELETE CASCADE,FOREIGN KEY(approved_by) REFERENCES app_user(id) ON DELETE SET NULL);
        CREATE INDEX idx_hub_user_tenant_tenant ON hub_user_tenant(tenant_id);
      `)
  },
  {
    version: 8,
    name: 'dados da empresa e contato dos usuarios do Hub',
    up: db =>
      db.exec(`
        CREATE TABLE hub_user_profile(user_id INTEGER PRIMARY KEY,document TEXT,company TEXT,contact_name TEXT,contact_email TEXT,contact_phone TEXT,FOREIGN KEY(user_id) REFERENCES app_user(id) ON DELETE CASCADE);
      `)
  },
  {
    version: 9,
    name: 'homologacao: quantos itens obrigatorios faltavam quando foi liberada',
    up: db => db.exec('ALTER TABLE hub_user_tenant ADD COLUMN approved_missing INTEGER')
  }
];
export const SCHEMA_VERSION = MIGRATIONS.at(-1).version;

export function openDatabase(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  migrate(db);
  db.pragma('optimize');
  return db;
}

function migrate(db) {
  const current = db.pragma('user_version', { simple: true });
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    db.transaction(() => {
      migration.up(db);
      db.pragma(`user_version = ${migration.version}`);
    })();
  }
}

// Bancos anteriores ao controle de versao ja podem ter parte destas tabelas e colunas, por isso o passo e idempotente.
function baseSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS product(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS client(id INTEGER PRIMARY KEY AUTOINCREMENT,external_id TEXT NOT NULL UNIQUE,name TEXT NOT NULL,document TEXT,first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS terminal(id INTEGER PRIMARY KEY AUTOINCREMENT,external_id TEXT NOT NULL UNIQUE,client_id INTEGER NOT NULL,name TEXT NOT NULL,computer_name TEXT,product_code TEXT NOT NULL,channel TEXT NOT NULL DEFAULT 'production',current_version TEXT NOT NULL DEFAULT '0.0.0',os_version TEXT,first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(client_id) REFERENCES client(id));
    CREATE TABLE IF NOT EXISTS release(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,version TEXT NOT NULL,channel TEXT NOT NULL CHECK(channel IN ('test','beta','production')),file_path TEXT NOT NULL,sha256 TEXT NOT NULL,size_bytes INTEGER NOT NULL,mandatory INTEGER NOT NULL DEFAULT 0,minimum_version TEXT,notes TEXT,active INTEGER NOT NULL DEFAULT 1,published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(product_id) REFERENCES product(id),UNIQUE(product_id,version,channel));
    CREATE TABLE IF NOT EXISTS ci_artifact(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,product_code TEXT NOT NULL,version TEXT NOT NULL,channel TEXT NOT NULL CHECK(channel IN ('test','beta','production')),file_path TEXT NOT NULL,original_name TEXT NOT NULL,sha256 TEXT NOT NULL,size_bytes INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,consumed_at TEXT,FOREIGN KEY(user_id) REFERENCES app_user(id));
    CREATE TABLE IF NOT EXISTS release_target(id INTEGER PRIMARY KEY AUTOINCREMENT,release_id INTEGER NOT NULL,target_type TEXT NOT NULL CHECK(target_type IN ('all','client')),client_id INTEGER,FOREIGN KEY(release_id) REFERENCES release(id) ON DELETE CASCADE,FOREIGN KEY(client_id) REFERENCES client(id),CHECK((target_type='all' AND client_id IS NULL) OR (target_type='client' AND client_id IS NOT NULL)),UNIQUE(release_id,client_id));
    CREATE TABLE IF NOT EXISTS terminal_event(id INTEGER PRIMARY KEY AUTOINCREMENT,terminal_id INTEGER,previous_version TEXT,target_version TEXT,status TEXT NOT NULL,message TEXT,ip TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(terminal_id) REFERENCES terminal(id));
    CREATE TABLE IF NOT EXISTS terminal_database_request(id INTEGER PRIMARY KEY AUTOINCREMENT,terminal_id INTEGER NOT NULL UNIQUE,requested_at TEXT DEFAULT CURRENT_TIMESTAMP,requested_by INTEGER,last_upload_id INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(terminal_id) REFERENCES terminal(id) ON DELETE CASCADE,FOREIGN KEY(requested_by) REFERENCES app_user(id) ON DELETE SET NULL);
    CREATE TABLE IF NOT EXISTS terminal_database_upload(id INTEGER PRIMARY KEY AUTOINCREMENT,terminal_id INTEGER NOT NULL,file_path TEXT NOT NULL,original_name TEXT NOT NULL,sha256 TEXT NOT NULL,size_bytes INTEGER NOT NULL,ip TEXT,received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(terminal_id) REFERENCES terminal(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS terminal_database_setting(id INTEGER PRIMARY KEY CHECK(id=1),retention_days INTEGER NOT NULL DEFAULT 30,retention_count INTEGER NOT NULL DEFAULT 5,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT OR IGNORE INTO terminal_database_setting(id,retention_days,retention_count) VALUES(1,30,5);
    CREATE TABLE IF NOT EXISTS terminal_live_event(id INTEGER PRIMARY KEY AUTOINCREMENT,terminal_id INTEGER,type TEXT NOT NULL,name TEXT NOT NULL,operation TEXT NOT NULL,value_text TEXT,received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,ip TEXT,FOREIGN KEY(terminal_id) REFERENCES terminal(id) ON DELETE SET NULL);
    CREATE TABLE IF NOT EXISTS application_error(id INTEGER PRIMARY KEY AUTOINCREMENT,terminal_id INTEGER,product_code TEXT NOT NULL DEFAULT 'pdv',occurred_at TEXT NOT NULL,version TEXT,terminal_name TEXT,checkout_number TEXT,computer_name TEXT,mac_address TEXT,user_name TEXT,session_id TEXT,exception_class TEXT NOT NULL,message TEXT NOT NULL,stack_trace TEXT,screenshot_base64 TEXT,screenshot_mime TEXT,ip TEXT,received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(terminal_id) REFERENCES terminal(id));
    CREATE TABLE IF NOT EXISTS error_setting(id INTEGER PRIMARY KEY CHECK(id=1),store_screenshot INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS error_rule(id INTEGER PRIMARY KEY AUTOINCREMENT,signature TEXT NOT NULL,product_code TEXT NOT NULL,ignored INTEGER NOT NULL DEFAULT 0,fixed_release_id INTEGER,created_by INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(fixed_release_id) REFERENCES release(id) ON DELETE SET NULL,FOREIGN KEY(created_by) REFERENCES app_user(id) ON DELETE SET NULL,UNIQUE(signature,product_code));
    INSERT OR IGNORE INTO error_setting(id,store_screenshot) VALUES(1,0);
    CREATE TABLE IF NOT EXISTS app_user(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT NOT NULL UNIQUE,name TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'operator' CHECK(role IN ('admin','operator')),active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS user_product(user_id INTEGER NOT NULL,product_id INTEGER NOT NULL,PRIMARY KEY(user_id,product_id),FOREIGN KEY(user_id) REFERENCES app_user(id) ON DELETE CASCADE,FOREIGN KEY(product_id) REFERENCES product(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS user_channel(user_id INTEGER NOT NULL,channel TEXT NOT NULL CHECK(channel IN ('test','beta','production')),PRIMARY KEY(user_id,channel),FOREIGN KEY(user_id) REFERENCES app_user(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS api_token_product(user_id INTEGER NOT NULL,product_id INTEGER NOT NULL,PRIMARY KEY(user_id,product_id),FOREIGN KEY(user_id) REFERENCES app_user(id) ON DELETE CASCADE,FOREIGN KEY(product_id) REFERENCES product(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS api_token_channel(user_id INTEGER NOT NULL,channel TEXT NOT NULL CHECK(channel IN ('test','beta','production')),PRIMARY KEY(user_id,channel),FOREIGN KEY(user_id) REFERENCES app_user(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS notification_read(user_id INTEGER NOT NULL,notification_key TEXT NOT NULL,read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,notification_key),FOREIGN KEY(user_id) REFERENCES app_user(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS product_theme(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,theme TEXT NOT NULL CHECK(theme IN ('agrosys','aliare')),name TEXT NOT NULL DEFAULT 'Padrão',is_default INTEGER NOT NULL DEFAULT 0,priority INTEGER NOT NULL DEFAULT 0,start_date TEXT,end_date TEXT,weekdays TEXT,specific_dates TEXT,settings TEXT NOT NULL DEFAULT '{}',logo_path TEXT,background_path TEXT,start_images TEXT NOT NULL DEFAULT '[]',active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(product_id) REFERENCES product(id) ON DELETE CASCADE);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_product_theme_default ON product_theme(product_id,theme) WHERE is_default=1;
    CREATE INDEX IF NOT EXISTS idx_product_theme_lookup ON product_theme(product_id,theme,active,priority DESC);
    CREATE INDEX IF NOT EXISTS idx_release_lookup ON release(product_id,channel,active,published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_terminal_client ON terminal(client_id,last_seen_at DESC);
    CREATE INDEX IF NOT EXISTS idx_event_terminal ON terminal_event(terminal_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_database_upload_terminal ON terminal_database_upload(terminal_id,received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_live_event_terminal ON terminal_live_event(terminal_id,received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_application_error_received ON application_error(received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_application_error_terminal ON application_error(terminal_id,received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_error_rule_signature ON error_rule(signature,product_code);
  `);

  ensureColumn(db, 'release', 'artifact_type', "TEXT NOT NULL DEFAULT 'package'");
  ensureColumn(db, 'release', 'original_name', 'TEXT');
  ensureColumn(db, 'release', 'deadline_at', 'TEXT');
  ensureColumn(db, 'terminal_event', 'release_id', 'INTEGER');
  ensureColumn(db, 'release', 'blocked', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'release', 'technical_notes', 'TEXT');
  ensureColumn(db, 'release', 'show_notes_pdv', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'release', 'published_by', 'INTEGER');
  ensureColumn(db, 'release', 'executable_sha256', 'TEXT');
  ensureColumn(db, 'release', 'deleted_at', 'TEXT');
  ensureColumn(db, 'release', 'deleted_by', 'INTEGER');
  ensureColumn(db, 'release', 'signature', 'TEXT');
  ensureColumn(db, 'release', 'signature_key_id', 'TEXT');
  ensureColumn(db, 'app_user', 'api_token_hash', 'TEXT');
  ensureColumn(db, 'app_user', 'api_token_created_at', 'TEXT');
  ensureColumn(db, 'ci_artifact', 'user_id', 'INTEGER');
  ensureColumn(db, 'ci_artifact', 'release_id', 'INTEGER');
  ensureColumn(db, 'ci_artifact', 'api_token_id', 'INTEGER');
  ensureColumn(db, 'application_error', 'key_terminal_id', 'TEXT');
  ensureColumn(db, 'application_error', 'crypto_salt', 'TEXT');
  ensureColumn(db, 'application_error', 'crypto_iv', 'TEXT');
  ensureColumn(db, 'application_error', 'crypto_auth_tag', 'TEXT');
  ensureColumn(db, 'application_error', 'encrypted_payload', 'TEXT');
  ensureColumn(db, 'application_error', 'reported_executable_sha256', 'TEXT');
  ensureColumn(db, 'application_error', 'detected_release_id', 'INTEGER');
  ensureColumn(db, 'application_error', 'executable_hash_status', 'TEXT');
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_token(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,name TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,expires_at TEXT,revoked_at TEXT,last_used_at TEXT,FOREIGN KEY(user_id) REFERENCES app_user(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS api_token_item_product(token_id INTEGER NOT NULL,product_id INTEGER NOT NULL,PRIMARY KEY(token_id,product_id),FOREIGN KEY(token_id) REFERENCES api_token(id) ON DELETE CASCADE,FOREIGN KEY(product_id) REFERENCES product(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS api_token_item_channel(token_id INTEGER NOT NULL,channel TEXT NOT NULL CHECK(channel IN ('test','beta','production')),PRIMARY KEY(token_id,channel),FOREIGN KEY(token_id) REFERENCES api_token(id) ON DELETE CASCADE);
    CREATE INDEX IF NOT EXISTS idx_api_token_user ON api_token(user_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ci_artifact_token ON ci_artifact(api_token_id,created_at DESC);
    CREATE TABLE IF NOT EXISTS ci_artifact_channel(artifact_id TEXT NOT NULL,channel TEXT NOT NULL CHECK(channel IN ('test','beta','production')),PRIMARY KEY(artifact_id,channel),FOREIGN KEY(artifact_id) REFERENCES ci_artifact(id) ON DELETE CASCADE);
    INSERT OR IGNORE INTO ci_artifact_channel(artifact_id,channel) SELECT id,channel FROM ci_artifact;
    CREATE INDEX IF NOT EXISTS idx_event_created_at ON terminal_event(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_event_release ON terminal_event(release_id,created_at DESC);
    UPDATE application_error SET received_at=replace(received_at,' ','T')||'Z' WHERE received_at NOT LIKE '%T%';
    CREATE TRIGGER IF NOT EXISTS trg_application_error_iso_time AFTER INSERT ON application_error
    BEGIN
      UPDATE application_error SET received_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
    END;
  `);
  migrateLegacyApiTokens(db);
}

// Mensagens gravadas quando o codigo tinha UTF-8 lido como Latin-1 (ex.: "VersÃ£o").
function fixEventMessageEncoding(db) {
  const update = db.prepare('UPDATE terminal_event SET message=? WHERE id=?');
  for (const row of db.prepare("SELECT id,message FROM terminal_event WHERE message LIKE '%Ã%'").all()) {
    if ([...row.message].some(char => char.charCodeAt(0) > 0xff)) continue;
    const fixed = Buffer.from(row.message, 'latin1').toString('utf8');
    if (!fixed.includes('�') && !fixed.includes('Ã')) update.run(fixed, row.id);
  }
}

function migrateLegacyApiTokens(db) {
  const users = db
    .prepare('SELECT id,api_token_hash,api_token_created_at FROM app_user WHERE api_token_hash IS NOT NULL')
    .all();
  for (const user of users) {
    db.prepare(
      'INSERT OR IGNORE INTO api_token(user_id,name,token_hash,created_at) VALUES(?,?,?,COALESCE(?,CURRENT_TIMESTAMP))'
    ).run(user.id, 'Token migrado', user.api_token_hash, user.api_token_created_at);
    const token = db.prepare('SELECT id FROM api_token WHERE token_hash=?').get(user.api_token_hash);
    if (!token) continue;
    db.prepare(
      'INSERT OR IGNORE INTO api_token_item_product(token_id,product_id) SELECT ?,product_id FROM api_token_product WHERE user_id=?'
    ).run(token.id, user.id);
    db.prepare(
      'INSERT OR IGNORE INTO api_token_item_channel(token_id,channel) SELECT ?,channel FROM api_token_channel WHERE user_id=?'
    ).run(token.id, user.id);
  }
}

function ensureColumn(db, table, column, definition) {
  const exists = db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some(item => item.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
