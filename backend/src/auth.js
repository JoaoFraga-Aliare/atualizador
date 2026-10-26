import crypto from 'node:crypto';

export const CHANNELS = ['test', 'beta', 'production'];

// Compara segredos em tempo constante; o hash iguala os tamanhos.
export function sameSecret(value, expected) {
  if (!expected) return false;
  const digest = item =>
    crypto
      .createHash('sha256')
      .update(String(item ?? ''))
      .digest();
  return crypto.timingSafeEqual(digest(value), digest(expected));
}

export function hashPassword(password) {
  if (String(password || '').length < 8) throw new Error('password_too_short');
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [salt, expectedHex] = String(stored).split(':');
    const actual = crypto.scryptSync(String(password), salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function ensureInitialAdmin(db, username, password) {
  if (!username || !password || db.prepare("SELECT 1 FROM app_user WHERE role='admin' LIMIT 1").get()) return;
  db.prepare("INSERT INTO app_user(username,name,password_hash,role) VALUES(?,?,?,'admin')").run(
    username,
    'Administrador',
    hashPassword(password)
  );
}

export function userScopes(db, user) {
  if (user.role === 'admin') return { all: true, productIds: [], channels: CHANNELS };
  return {
    all: false,
    productIds: db
      .prepare('SELECT product_id FROM user_product WHERE user_id=?')
      .all(user.id)
      .map(x => x.product_id),
    channels: db
      .prepare('SELECT channel FROM user_channel WHERE user_id=?')
      .all(user.id)
      .map(x => x.channel)
  };
}

export function canAccess(scopes, productId, channel) {
  return (
    scopes.all || (scopes.productIds.includes(Number(productId)) && (!channel || scopes.channels.includes(channel)))
  );
}
