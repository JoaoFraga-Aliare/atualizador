import crypto from 'node:crypto';

export function normalizeScreenshot(value) {
  if (!value) return null;
  const match = String(value).match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s),
    mime = match?.[1] || 'image/png',
    base64 = (match?.[2] || String(value)).replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error('invalid_screenshot_base64');
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error('invalid_screenshot_size');
  return { base64, mime };
}
export const cryptoInfo = Buffer.from('central-atualizacao:error-payload:v1');
export function cryptoPart(value, name, expected) {
  const text = String(value || '').replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new Error(`invalid_${name}`);
  const result = Buffer.from(text, 'base64');
  if (!result.length || (expected && result.length !== expected)) throw new Error(`invalid_${name}`);
  return result;
}
export function normalizeKeyTerminalId(terminalId) {
  return String(terminalId || '')
    .trim()
    .toLowerCase();
}
export function errorKey(terminalId, salt) {
  const ikm = Buffer.from(`${normalizeKeyTerminalId(terminalId)}:${process.env.INSTALLATION_KEY || ''}`, 'utf8');
  try {
    return Buffer.from(crypto.hkdfSync('sha256', ikm, salt, cryptoInfo, 32));
  } finally {
    ikm.fill(0);
  }
}
export function decryptEnvelope(terminalId, envelope) {
  const salt = cryptoPart(envelope.salt, 'salt'),
    iv = cryptoPart(envelope.iv, 'iv', 12),
    tag = cryptoPart(envelope.authTag, 'auth_tag', 16),
    ciphertext = cryptoPart(envelope.ciphertext, 'ciphertext'),
    key = errorKey(terminalId, salt);
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return { plain: Buffer.concat([decipher.update(ciphertext), decipher.final()]), salt, iv, tag, ciphertext, key };
  } catch {
    throw new Error('error_payload_authentication_failed');
  }
}
export function encryptErrorPayload(terminalId, payload) {
  const salt = crypto.randomBytes(32),
    iv = crypto.randomBytes(12),
    key = errorKey(terminalId, salt),
    cipher = crypto.createCipheriv('aes-256-gcm', key, iv),
    plain = Buffer.from(JSON.stringify(payload), 'utf8'),
    ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]),
    tag = cipher.getAuthTag(),
    result = {
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      authTag: tag.toString('base64'),
      ciphertext: ciphertext.toString('base64')
    };
  plain.fill(0);
  key.fill(0);
  return result;
}
export function decryptStoredError(error) {
  const decrypted = decryptEnvelope(error.key_terminal_id, {
    salt: error.crypto_salt,
    iv: error.crypto_iv,
    authTag: error.crypto_auth_tag,
    ciphertext: error.encrypted_payload
  });
  try {
    return { payload: JSON.parse(decrypted.plain.toString('utf8')), plain: decrypted.plain, key: decrypted.key };
  } catch {
    decrypted.plain.fill(0);
    decrypted.key.fill(0);
    throw new Error('invalid_encrypted_error_payload');
  }
}
export const errorSignature = (exceptionClass, message) =>
  crypto
    .createHash('sha256')
    .update(`${exceptionClass.trim().toLowerCase()}\n${message.replace(/\s+/g, ' ').trim().toLowerCase()}`)
    .digest('hex');
