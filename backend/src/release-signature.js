import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SIGNATURE_ALGORITHM = 'ed25519';
export const SIGNED_PAYLOAD_FORMAT = 'agrosys-release-v1';

// Chave Ed25519 em PEM (PKCS#8). Criada na primeira execucao; perder o arquivo
// obriga a distribuir a nova chave publica para todos os atualizadores.
export function loadSigningKey(file) {
  let created = false;
  if (!fs.existsSync(file)) {
    const { privateKey } = crypto.generateKeyPairSync('ed25519');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' });
    created = true;
  }
  const privateKey = crypto.createPrivateKey(fs.readFileSync(file, 'utf8'));
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('signing_key_not_ed25519');
  const publicKey = crypto.createPublicKey(privateKey);
  const raw = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
  return {
    privateKey,
    publicKey,
    created,
    keyId: crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16),
    publicKeyBase64: raw.toString('base64'),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' })
  };
}

// Texto assinado: linhas separadas por \n, UTF-8, sem \n no final. O atualizador
// remonta o mesmo texto com o produto e o canal que ele consultou.
export function releaseSignaturePayload({ releaseId, product, channel, version, sha256, sizeBytes }) {
  const fields = { releaseId, product, channel, version, sha256: String(sha256 || '').toLowerCase(), sizeBytes };
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined || value === null || String(value) === '' || /[\r\n]/.test(String(value))) throw new Error(`invalid_signature_field_${name}`);
  }
  if (!/^[a-f0-9]{64}$/.test(fields.sha256)) throw new Error('invalid_signature_field_sha256');
  return [SIGNED_PAYLOAD_FORMAT, ...Object.entries(fields).map(([name, value]) => `${name}=${value}`)].join('\n');
}

export function signRelease(key, release) {
  return crypto.sign(null, Buffer.from(releaseSignaturePayload(release), 'utf8'), key.privateKey).toString('base64');
}

export function verifyReleaseSignature(publicKey, release, signature) {
  try { return crypto.verify(null, Buffer.from(releaseSignaturePayload(release), 'utf8'), publicKey, Buffer.from(String(signature || ''), 'base64')); }
  catch { return false; }
}

export function createReleaseSigner(db, key) {
  const select = db.prepare('SELECT r.id,r.version,r.channel,r.sha256,r.size_bytes,p.code product FROM release r JOIN product p ON p.id=r.product_id WHERE r.id=?');
  const update = db.prepare('UPDATE release SET signature=?,signature_key_id=? WHERE id=?');
  function signStoredRelease(id) {
    const row = select.get(id);
    if (!row) throw new Error('release_not_found');
    update.run(signRelease(key, { releaseId: row.id, product: row.product, channel: row.channel, version: row.version, sha256: row.sha256, sizeBytes: row.size_bytes }), key.keyId, row.id);
  }
  // Assina publicacoes antigas e as assinadas com outra chave.
  function signPendingReleases() {
    let signed = 0;
    for (const { id } of db.prepare("SELECT id FROM release WHERE sha256<>'pending' AND (signature IS NULL OR signature_key_id IS NOT ?)").all(key.keyId)) {
      try { signStoredRelease(id); signed += 1; }
      catch (error) { console.error(`Falha ao assinar a publicacao ${id}: ${error.message}`); }
    }
    return signed;
  }
  return { signStoredRelease, signPendingReleases };
}
