import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { SCHEMA_VERSION, openDatabase } from '../src/db.js';

test('creates release artifact and event log columns', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'central-atualizacao-'));
  const db = openDatabase(path.join(directory, 'test.db'));
  t.after(() => {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const releaseColumns = db
    .prepare('PRAGMA table_info(release)')
    .all()
    .map(item => item.name);
  const eventColumns = db
    .prepare('PRAGMA table_info(terminal_event)')
    .all()
    .map(item => item.name);
  const errorColumns = db
    .prepare('PRAGMA table_info(application_error)')
    .all()
    .map(item => item.name);

  assert.ok(releaseColumns.includes('artifact_type'));
  assert.ok(releaseColumns.includes('original_name'));
  assert.ok(releaseColumns.includes('deadline_at'));
  assert.ok(eventColumns.includes('release_id'));
  assert.ok(releaseColumns.includes('blocked'));
  assert.ok(releaseColumns.includes('technical_notes'));
  assert.ok(releaseColumns.includes('show_notes_pdv'));
  assert.ok(releaseColumns.includes('published_by'));
  assert.ok(releaseColumns.includes('executable_sha256'));
  for (const column of ['reported_executable_sha256', 'detected_release_id', 'executable_hash_status'])
    assert.ok(errorColumns.includes(column));
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_user'").get());
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_product'").get());
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_channel'").get());
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='notification_read'").get());
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='application_error'").get());
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='error_rule'").get());
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='product_theme'").get());
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_product_theme_default'").get());
  for (const column of ['key_terminal_id', 'crypto_salt', 'crypto_iv', 'crypto_auth_tag', 'encrypted_payload'])
    assert.ok(errorColumns.includes(column));
  assert.deepEqual(db.prepare('SELECT store_screenshot FROM error_setting WHERE id=1').get(), { store_screenshot: 0 });
  const hash = 'a'.repeat(64);
  const inserted = db
    .prepare(
      'INSERT INTO application_error(terminal_id,product_code,occurred_at,exception_class,message,screenshot_mime,ip,key_terminal_id,crypto_salt,crypto_iv,crypto_auth_tag,encrypted_payload,reported_executable_sha256,detected_release_id,executable_hash_status) VALUES(?,?,CURRENT_TIMESTAMP,?,?,?,?,?,?,?,?,?,?,?,?)'
    )
    .run(
      null,
      'pdv',
      '<encrypted>',
      '<encrypted>',
      null,
      '127.0.0.1',
      'terminal-1',
      'salt',
      'iv',
      'tag',
      'ciphertext',
      hash,
      null,
      'unauthorized'
    );
  assert.deepEqual(
    db
      .prepare('SELECT reported_executable_sha256,executable_hash_status FROM application_error WHERE id=?')
      .get(inserted.lastInsertRowid),
    { reported_executable_sha256: hash, executable_hash_status: 'unauthorized' }
  );
});

test('applies versioned migrations once and upgrades legacy databases', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'central-migrations-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'legacy.db');
  const legacy = new Database(file);
  legacy.exec(
    'CREATE TABLE terminal_event(id INTEGER PRIMARY KEY AUTOINCREMENT,terminal_id INTEGER,previous_version TEXT,target_version TEXT,status TEXT NOT NULL,message TEXT,ip TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'
  );
  legacy
    .prepare('INSERT INTO terminal_event(status,message) VALUES(?,?)')
    .run('published', 'VersÃ£o 1.0 publicada atÃ© amanhÃ£');
  legacy.prepare('INSERT INTO terminal_event(status,message) VALUES(?,?)').run('success', 'Atualização aplicada');
  legacy.close();

  let db = openDatabase(file);
  assert.equal(db.pragma('user_version', { simple: true }), SCHEMA_VERSION);
  assert.deepEqual(
    db
      .prepare('SELECT message FROM terminal_event ORDER BY id')
      .all()
      .map(row => row.message),
    ['Versão 1.0 publicada até amanhã', 'Atualização aplicada']
  );
  assert.ok(
    db
      .prepare('PRAGMA table_info(terminal_event)')
      .all()
      .some(item => item.name === 'release_id')
  );
  db.prepare('INSERT INTO terminal_event(status,message) VALUES(?,?)').run('published', 'VersÃ£o depois da migracao');
  db.close();

  db = openDatabase(file);
  assert.equal(db.prepare('SELECT message FROM terminal_event WHERE id=3').get().message, 'VersÃ£o depois da migracao');
  db.close();
});
