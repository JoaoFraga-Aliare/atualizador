import crypto from 'node:crypto';
import { userScopes } from './auth.js';
import { bearerToken, requestTerminalId } from './terminal-keys.js';
import { SESSION_COOKIE, readCookie } from './sessions.js';

export function createAuthMiddleware(db, terminalKeys, sessions) {
  // Painel: cookie httpOnly da sessao (navegador) ou Bearer com o mesmo JWT (scripts e testes).
  const adminAuth = (req, res, next) => {
    let session;
    const header = bearerToken(req),
      cookie = readCookie(req, SESSION_COOKIE);
    try {
      session = sessions.verify(header || cookie);
    } catch {
      return res.status(401).json({ error: 'unauthorized' });
    }
    // SameSite=Strict ja barra outro site; a origem e conferida tambem nas alteracoes feitas pelo cookie.
    if (!header && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      let sameOrigin = true;
      try {
        sameOrigin = !origin || new URL(origin).hostname === req.hostname;
      } catch {
        sameOrigin = false;
      }
      if (!sameOrigin) return res.status(403).json({ error: 'invalid_origin' });
    }
    const user = db
      .prepare('SELECT id,username,name,role,hub_role,active FROM app_user WHERE id=?')
      .get(session.userId);
    if (!user?.active) return res.status(401).json({ error: 'unauthorized' });
    req.user = user;
    req.session = session;
    req.scopes = userScopes(db, user);
    next();
  };
  // Aceita a chave global ou a chave do terminal; rotas multipart repetem a checagem depois de ler o corpo.
  const installationAuth = (req, res, next) => {
    const result = terminalKeys.authenticate(bearerToken(req), requestTerminalId(req));
    if (!result.ok) {
      if (result.error === 'invalid_installation_key') res.locals.installationAuthFailed = true;
      return res.status(result.status).json({ error: result.error });
    }
    req.installation = result;
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
