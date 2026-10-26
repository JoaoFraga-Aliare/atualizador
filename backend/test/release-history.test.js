import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../src/db.js';
import { cleanupCandidates, softDeleteRelease } from '../src/release-history.js';

test('finds an older active release without terminals and soft deletes it', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'release-history-')),
    packages = path.join(directory, 'packages');
  fs.mkdirSync(path.join(packages, 'pdv'), { recursive: true });
  const db = openDatabase(path.join(directory, 'test.db'));
  t.after(() => {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const productId = Number(db.prepare("INSERT INTO product(code,name) VALUES('pdv','PDV')").run().lastInsertRowid),
    userId = Number(
      db.prepare("INSERT INTO app_user(username,name,password_hash,role) VALUES('admin','Admin','x','admin')").run()
        .lastInsertRowid
    ),
    clientId = Number(db.prepare("INSERT INTO client(external_id,name) VALUES('c1','Cliente')").run().lastInsertRowid);
  const oldFile = 'pdv/1.0-production.zip',
    latestFile = 'pdv/2.0-production.zip';
  fs.writeFileSync(path.join(packages, oldFile), 'old');
  fs.writeFileSync(path.join(packages, latestFile), 'latest');
  const insert = db.prepare(
      "INSERT INTO release(product_id,version,channel,file_path,sha256,size_bytes,published_by) VALUES(?,?,'production',?,'hash',?,?)"
    ),
    oldId = Number(insert.run(productId, '1.0', oldFile, 3, userId).lastInsertRowid),
    latestId = Number(insert.run(productId, '2.0', latestFile, 6, userId).lastInsertRowid);
  db.prepare(
    "INSERT INTO terminal(external_id,client_id,name,product_code,channel,current_version) VALUES('t1',?,'Caixa','pdv','production','2.0')"
  ).run(clientId);
  const req = { user: { id: userId, role: 'admin' }, scopes: { all: true, productIds: [], channels: [] } },
    items = cleanupCandidates(db, req, packages);
  assert.deepEqual(
    items.map(x => x.id),
    [oldId]
  );
  assert.equal(items[0].latest_version, '2.0');
  assert.equal(items[0].reclaim_bytes, 3);
  softDeleteRelease(db, items[0], packages, userId);
  const deleted = db.prepare('SELECT active,blocked,deleted_at FROM release WHERE id=?').get(oldId);
  assert.equal(deleted.active, 0);
  assert.equal(deleted.blocked, 1);
  assert.ok(deleted.deleted_at);
  assert.equal(fs.existsSync(path.join(packages, oldFile)), false);
  assert.ok(db.prepare('SELECT id FROM release WHERE id=?').get(oldId));
  assert.ok(db.prepare('SELECT id FROM release WHERE id=?').get(latestId));
});
