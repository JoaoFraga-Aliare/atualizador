import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { sameSecret, userScopes } from './auth.js';

export function createAuthMiddleware(db) {
  const adminAuth = (req, res, next) => {
    try {
      const token = jwt.verify((req.get('authorization') || '').replace(/^Bearer /, ''), process.env.JWT_SECRET);
      const user = db.prepare('SELECT id,username,name,role,active FROM app_user WHERE id=?').get(token.sub);
      if (!user?.active) throw new Error();
      req.user = user;
      req.scopes = userScopes(db, user);
      next();
    } catch {
      res.status(401).json({ error: 'unauthorized' });
    }
  };
  const installationAuth = (req, res, next) => {
    const value = (req.get('authorization') || '').replace(/^Bearer /, '');
    if (!sameSecret(value, process.env.INSTALLATION_KEY)) {
      res.locals.installationAuthFailed = true;
      return res.status(401).json({ error: 'invalid_installation_key' });
    }
    next();
  };
  const ciAuth = (req, res, next) => {
    const value = (req.get('authorization') || '').replace(/^Bearer /, '');
    try {
      const hash = crypto.createHash('sha256').update(value).digest('hex'),
        token = db
          .prepare(
            "SELECT * FROM api_token WHERE token_hash=? AND revoked_at IS NULL AND (expires_at IS NULL OR datetime(expires_at)>datetime('now'))"
          )
          .get(hash),
        legacyUser = token ? null : db.prepare('SELECT id FROM app_user WHERE api_token_hash=?').get(hash),
        user = db
          .prepare('SELECT id,username,name,role,active FROM app_user WHERE id=?')
          .get(token?.user_id || legacyUser?.id),
        productIds = token
          ? db
              .prepare('SELECT product_id FROM api_token_item_product WHERE token_id=?')
              .all(token.id)
              .map(item => item.product_id)
          : db
              .prepare('SELECT product_id FROM api_token_product WHERE user_id=?')
              .all(user?.id)
              .map(item => item.product_id),
        channels = token
          ? db
              .prepare('SELECT channel FROM api_token_item_channel WHERE token_id=?')
              .all(token.id)
              .map(item => item.channel)
          : db
              .prepare('SELECT channel FROM api_token_channel WHERE user_id=?')
              .all(user?.id)
              .map(item => item.channel);
      if (!value || !user?.active || !productIds.length || !channels.length) throw new Error();
      if (token) db.prepare('UPDATE api_token SET last_used_at=CURRENT_TIMESTAMP WHERE id=?').run(token.id);
      req.user = user;
      req.apiToken = token || null;
      req.scopes = { all: false, productIds, channels };
      next();
    } catch {
      res.status(401).json({ error: 'invalid_api_token' });
    }
  };
  return { adminAuth, installationAuth, ciAuth };
}
