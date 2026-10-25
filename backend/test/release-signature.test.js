import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../src/db.js';
import { createReleaseSigner, loadSigningKey, releaseSignaturePayload, signRelease, verifyReleaseSignature } from '../src/release-signature.js';

// Vetor fixo, repetido no prompt do Atualizador do PDV: chave com semente 00..1f.
const seed = Buffer.from(Array.from({ length: 32 }, (_, i) => i));
const fixedKey = { privateKey: crypto.createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' }) };
const release = { releaseId: 42, product: 'pdv', channel: 'production', version: '2.3.1.0', sha256: 'a'.repeat(64), sizeBytes: 1048576 };

test('builds the signed payload in the documented format', () => {
  assert.equal(releaseSignaturePayload(release), `agrosys-release-v1\nreleaseId=42\nproduct=pdv\nchannel=production\nversion=2.3.1.0\nsha256=${'a'.repeat(64)}\nsizeBytes=1048576`);
  assert.throws(() => releaseSignaturePayload({ ...release, version: '1.0\nsha256=x' }), /invalid_signature_field_version/);
  assert.throws(() => releaseSignaturePayload({ ...release, sha256: 'pending' }), /invalid_signature_field_sha256/);
});

test('matches the fixed test vector and rejects tampering', () => {
  const signature = signRelease(fixedKey, release);
  assert.equal(signature, 'dh+KJaRDlnc+9Ob597G0cAuhXOjCO7kpkCil2dRnuprXzA+5mkfo9+6aud/FFX22saH5xcX712DAzGJD5MnaCw==');
  const publicKey = crypto.createPublicKey(fixedKey.privateKey);
  assert.equal(Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url').toString('base64'), 'A6EHv/POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg=');
  assert.equal(verifyReleaseSignature(publicKey, release, signature), true);
  assert.equal(verifyReleaseSignature(publicKey, { ...release, sha256: 'b'.repeat(64) }, signature), false);
  assert.equal(verifyReleaseSignature(publicKey, { ...release, channel: 'beta' }, signature), false);
});

test('creates the signing key once and signs stored releases', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'central-signature-'));
  const db = openDatabase(path.join(directory, 'test.db'));
  t.after(() => { db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const keyFile = path.join(directory, 'keys', 'signing.pem');
  const key = loadSigningKey(keyFile);
  assert.equal(key.created, true);
  const again = loadSigningKey(keyFile);
  assert.equal(again.created, false);
  assert.equal(again.keyId, key.keyId);
  const productId = db.prepare("INSERT INTO product(code,name) VALUES('pdv','PDV')").run().lastInsertRowid;
  const insert = db.prepare("INSERT INTO release(product_id,version,channel,file_path,sha256,size_bytes) VALUES(?,?,'production','pdv/x.zip',?,10)");
  const signedId = insert.run(productId, '1.0.0', 'c'.repeat(64)).lastInsertRowid;
  insert.run(productId, '1.0.1', 'pending');
  const signer = createReleaseSigner(db, key);
  assert.equal(signer.signPendingReleases(), 1);
  assert.equal(signer.signPendingReleases(), 0);
  const row = db.prepare('SELECT signature,signature_key_id FROM release WHERE id=?').get(signedId);
  assert.equal(row.signature_key_id, key.keyId);
  assert.equal(verifyReleaseSignature(key.publicKey, { releaseId: signedId, product: 'pdv', channel: 'production', version: '1.0.0', sha256: 'c'.repeat(64), sizeBytes: 10 }, row.signature), true);
});
