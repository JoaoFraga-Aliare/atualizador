import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { strToU8, unzipSync, zipSync } from 'fflate';

function normalizeEntryName(value) {
  const name = String(value || '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '');
  const parts = name.split('/');
  if (
    !name ||
    name.includes('\0') ||
    name.startsWith('/') ||
    /^[a-z]:/i.test(name) ||
    parts.some(part => part === '' || part === '.' || part === '..')
  )
    throw new Error('zip_unsafe_path');
  return parts.join('/');
}

const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');

export function addGeneratedManifest(sourceZip, targetZip, metadata) {
  let archive,
    uncompressedSize = 0;
  try {
    archive = unzipSync(fs.readFileSync(sourceZip), {
      filter: entry => {
        if (entry.name.endsWith('/')) return false;
        uncompressedSize += entry.originalSize;
        if (uncompressedSize > 1024 * 1024 * 1024) throw new Error('zip_uncompressed_too_large');
        return true;
      }
    });
  } catch (error) {
    if (error.message === 'zip_uncompressed_too_large') throw error;
    throw new Error('invalid_zip');
  }
  const files = [],
    names = new Set(),
    output = {};
  for (const [entryName, data] of Object.entries(archive)) {
    const name = normalizeEntryName(entryName),
      key = name.toLocaleLowerCase('en-US');
    if (key === 'manifest.json') continue;
    if (names.has(key)) throw new Error('zip_duplicate_path');
    names.add(key);
    output[name] = data;
    files.push({ source: name, destination: name, sha256: sha256(data) });
  }
  if (!files.length) throw new Error('zip_has_no_files');
  files.sort((a, b) => a.source.localeCompare(b.source, 'en-US'));
  const executable =
    files.find(
      item => item.source.toLocaleLowerCase('en-US') === `${metadata.product}.exe`.toLocaleLowerCase('en-US')
    ) ||
    files.find(
      item =>
        item.source.split('/').pop().toLocaleLowerCase('en-US') === `${metadata.product}.exe`.toLocaleLowerCase('en-US')
    );
  const entryPoint = executable?.source || '';
  const manifest = {
    releaseId: String(metadata.releaseId),
    product: String(metadata.product),
    channel: String(metadata.channel),
    version: String(metadata.version),
    files
  };
  if (entryPoint) manifest.entryPoint = entryPoint;
  output['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2) + '\n');
  fs.mkdirSync(path.dirname(targetZip), { recursive: true });
  fs.writeFileSync(targetZip, zipSync(output, { level: 6 }));
  return { ...manifest, executableSha256: executable?.sha256 || null };
}
