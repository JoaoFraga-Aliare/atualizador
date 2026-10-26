import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { mergeAnalysis, readArtifactZip } from '../src/ci-artifacts.js';

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-artifacts-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function artifact(directory, id, version, files) {
  const relative = `${id}.zip`;
  fs.writeFileSync(
    path.join(directory, relative),
    zipSync(Object.fromEntries(Object.entries(files).map(([name, value]) => [name, strToU8(value)])))
  );
  return { id, version, user_name: `User ${id}`, product_code: 'pdv', channel: 'production', file_path: relative };
}

test('lists safe ZIP entries with a SHA-256 for each file', t => {
  const directory = fixture(t),
    item = artifact(directory, 'a', '1.0', { 'PDV.exe': 'binary', 'config/app.ini': 'value' }),
    files = readArtifactZip(path.join(directory, item.file_path));
  assert.equal(files.size, 2);
  assert.match(files.get('pdv.exe').sha256, /^[a-f0-9]{64}$/);
});
test('merge only asks for a choice when the same path has different content', t => {
  const directory = fixture(t),
    first = artifact(directory, 'a', '1.0', { 'PDV.exe': 'old', 'same.dll': 'same' }),
    second = artifact(directory, 'b', '2.0', { 'PDV.exe': 'new', 'same.dll': 'same', 'extra.txt': 'extra' }),
    analysis = mergeAnalysis(directory, [first, second]);
  assert.equal(analysis.byPath.size, 3);
  assert.equal(analysis.conflicts.length, 1);
  assert.equal(analysis.conflicts[0].path, 'PDV.exe');
  assert.deepEqual(
    analysis.conflicts[0].options.map(x => x.artifactId),
    ['a', 'b']
  );
  assert.equal(analysis.selected.get('same.dll').artifactId, 'b');
});
test('merge rejects artifacts without a common authorized channel', t => {
  const directory = fixture(t),
    first = artifact(directory, 'a', '1.0', { 'a.txt': 'a' }),
    second = { ...artifact(directory, 'b', '2.0', { 'b.txt': 'b' }), channel: 'beta' };
  assert.throws(() => mergeAnalysis(directory, [first, second]), /artifact_merge_no_common_channel/);
});
