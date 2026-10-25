import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../src/db.js';
import { canAccess, ensureInitialAdmin, hashPassword, sameSecret, userScopes, verifyPassword } from '../src/auth.js';

test('hashes and verifies passwords with a random salt', () => {
  const first = hashPassword('uma-senha-segura');
  const second = hashPassword('uma-senha-segura');
  assert.notEqual(first, second);
  assert.equal(verifyPassword('uma-senha-segura', first), true);
  assert.equal(verifyPassword('senha-incorreta', first), false);
});

test('creates one initial admin and enforces operator scopes', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'central-auth-'));
  const db = openDatabase(path.join(directory, 'test.db'));
  t.after(() => { db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  ensureInitialAdmin(db, 'admin', 'senha-admin');
  ensureInitialAdmin(db, 'outro', 'outra-senha');
  assert.equal(db.prepare("SELECT count(*) value FROM app_user WHERE role='admin'").get().value, 1);
  const productId = db.prepare("INSERT INTO product(code,name) VALUES('pdv','PDV')").run().lastInsertRowid;
  const userId = db.prepare("INSERT INTO app_user(username,name,password_hash,role) VALUES('operador','Operador',?,'operator')").run(hashPassword('senha-operador')).lastInsertRowid;
  db.prepare('INSERT INTO user_product(user_id,product_id) VALUES(?,?)').run(userId, productId);
  db.prepare("INSERT INTO user_channel(user_id,channel) VALUES(?,'beta')").run(userId);
  const scopes = userScopes(db, { id: Number(userId), role: 'operator' });
  assert.equal(canAccess(scopes, productId, 'beta'), true);
  assert.equal(canAccess(scopes, productId, 'production'), false);
  assert.equal(canAccess(scopes, Number(productId) + 1, 'beta'), false);
});

test('compares secrets without accepting a missing expected value', () => {
  assert.equal(sameSecret('chave-da-instalacao', 'chave-da-instalacao'), true);
  assert.equal(sameSecret('chave-da-instalaca', 'chave-da-instalacao'), false);
  assert.equal(sameSecret('', 'chave-da-instalacao'), false);
  assert.equal(sameSecret(undefined, 'chave-da-instalacao'), false);
  assert.equal(sameSecret('', ''), false);
  assert.equal(sameSecret('qualquer', undefined), false);
});
