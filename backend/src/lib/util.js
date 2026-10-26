import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const hashFileSync = file => {
  const hash = crypto.createHash('sha256'),
    buffer = Buffer.allocUnsafe(1024 * 1024),
    handle = fs.openSync(file, 'r');
  try {
    let bytes;
    do {
      bytes = fs.readSync(handle, buffer, 0, buffer.length, null);
      if (bytes) hash.update(buffer.subarray(0, bytes));
    } while (bytes);
    return hash.digest('hex');
  } finally {
    fs.closeSync(handle);
  }
};
export const textValue = value =>
  value === undefined || value === null || String(value).trim() === '' ? null : String(value).trim();
export function safeZipName(value) {
  return (
    String(value || 'banco.zip')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/^_+|_+$/g, '') || 'banco.zip'
  );
}
export function moveFile(source, target) {
  try {
    fs.renameSync(source, target);
  } catch (error) {
    if (error.code !== 'EXDEV') throw error;
    fs.copyFileSync(source, target);
    fs.unlinkSync(source);
  }
}
export function listFiles(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(item => {
    const full = path.join(folder, item.name);
    return item.isDirectory() ? listFiles(full) : [full];
  });
}
