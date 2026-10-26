import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { addGeneratedManifest } from '../src/package-manifest.js';

test('adds a manifest for every file while preserving the zip structure', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'updater-manifest-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'source.zip'),
    target = path.join(directory, 'target.zip');
  fs.writeFileSync(
    source,
    zipSync({
      'infra/schemas/Arquivos/001.sql': strToU8('select 1;'),
      'PDV.exe': strToU8('exe'),
      'my.dll': strToU8('dll'),
      'update.ini': strToU8('[update]')
    })
  );
  const generated = addGeneratedManifest(source, target, {
    releaseId: 42,
    product: 'pdv',
    channel: 'production',
    version: '3.0.0'
  });
  const output = unzipSync(fs.readFileSync(target)),
    manifest = JSON.parse(strFromU8(output['manifest.json']));
  assert.equal(manifest.releaseId, '42');
  assert.equal(manifest.entryPoint, 'PDV.exe');
  assert.equal(generated.executableSha256, crypto.createHash('sha256').update(output['PDV.exe']).digest('hex'));
  assert.deepEqual(
    manifest.files.map(item => item.source),
    ['infra/schemas/Arquivos/001.sql', 'my.dll', 'PDV.exe', 'update.ini']
  );
  for (const item of manifest.files) {
    assert.equal(item.destination, item.source);
    assert.equal(item.sha256, crypto.createHash('sha256').update(output[item.source]).digest('hex'));
  }
});

test('replaces a supplied root manifest with server metadata', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'updater-manifest-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'source.zip'),
    target = path.join(directory, 'target.zip');
  fs.writeFileSync(source, zipSync({ 'manifest.json': strToU8('{"releaseId":"wrong"}'), 'PDV.exe': strToU8('exe') }));
  addGeneratedManifest(source, target, { releaseId: 7, product: 'pdv', channel: 'test', version: '2.0' });
  const manifest = JSON.parse(strFromU8(unzipSync(fs.readFileSync(target))['manifest.json']));
  assert.equal(manifest.releaseId, '7');
  assert.equal(manifest.channel, 'test');
  assert.equal(manifest.files.length, 1);
});
