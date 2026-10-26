import crypto from 'node:crypto';
import { CHANNELS, userScopes, verifyPassword } from '../auth.js';
import { SESSION_COOKIE, clearSessionCookie, readCookie, setSessionCookie } from '../sessions.js';
import { bearerToken } from '../terminal-keys.js';

// Login do painel, perfil e tokens de API do usuario.
export function registerAccountRoutes(app, ctx) {
  const { sessions, db, adminAuth, loginIpLimiter, loginUserLimiter } = ctx;
  app.post('/api/v1/auth/login', loginIpLimiter, loginUserLimiter, (req, res) => {
    const user = db.prepare('SELECT * FROM app_user WHERE username=?').get(String(req.body?.user || '').trim());
    if (!user?.active || !verifyPassword(req.body?.password, user.password_hash))
      return res.status(401).json({ error: 'invalid_credentials' });
    const token = sessions.create(user, req);
    setSessionCookie(req, res, token);
    res.json({ token, user: { id: user.id, username: user.username, name: user.name, role: user.role } });
  });
  app.post('/api/v1/auth/logout', (req, res) => {
    try {
      sessions.revoke(sessions.verify(bearerToken(req) || readCookie(req, SESSION_COOKIE)).sessionId);
    } catch {}
    clearSessionCookie(req, res);
    res.json({ loggedOut: true });
  });
  app.get('/api/v1/admin/me/api-token', adminAuth, (req, res) => {
    const token = db.prepare('SELECT api_token_created_at FROM app_user WHERE id=?').get(req.user.id),
      productIds = db
        .prepare('SELECT product_id FROM api_token_product WHERE user_id=? ORDER BY product_id')
        .all(req.user.id)
        .map(item => item.product_id),
      channels = db
        .prepare('SELECT channel FROM api_token_channel WHERE user_id=? ORDER BY channel')
        .all(req.user.id)
        .map(item => item.channel);
    res.json({
      generated: Boolean(token?.api_token_created_at),
      createdAt: token?.api_token_created_at || null,
      productIds,
      channels
    });
  });
  app.post('/api/v1/admin/me/api-token', adminAuth, (req, res) => {
    const productIds = [...new Set((req.body.productIds || []).map(Number))],
      channels = [...new Set(req.body.channels || [])],
      allowed = userScopes(db, req.user);
    if (!productIds.length || !channels.length) return res.status(400).json({ error: 'api_token_scope_required' });
    if (
      productIds.some(
        id =>
          (!allowed.all && !allowed.productIds.includes(id)) ||
          !db.prepare('SELECT 1 FROM product WHERE id=? AND active=1').get(id)
      ) ||
      channels.some(channel => !CHANNELS.includes(channel) || (!allowed.all && !allowed.channels.includes(channel)))
    )
      return res.status(403).json({ error: 'api_token_scope_denied' });
    const value = `cu_${crypto.randomBytes(32).toString('hex')}`,
      hash = crypto.createHash('sha256').update(value).digest('hex');
    db.transaction(() => {
      db.prepare('UPDATE app_user SET api_token_hash=?,api_token_created_at=CURRENT_TIMESTAMP WHERE id=?').run(
        hash,
        req.user.id
      );
      db.prepare('DELETE FROM api_token_product WHERE user_id=?').run(req.user.id);
      db.prepare('DELETE FROM api_token_channel WHERE user_id=?').run(req.user.id);
      for (const productId of productIds)
        db.prepare('INSERT INTO api_token_product(user_id,product_id) VALUES(?,?)').run(req.user.id, productId);
      for (const channel of channels)
        db.prepare('INSERT INTO api_token_channel(user_id,channel) VALUES(?,?)').run(req.user.id, channel);
    })();
    res.status(201).json({
      token: value,
      productIds,
      channels,
      createdAt: db.prepare('SELECT api_token_created_at FROM app_user WHERE id=?').get(req.user.id)
        .api_token_created_at
    });
  });
  app.delete('/api/v1/admin/me/api-token', adminAuth, (req, res) => {
    db.transaction(() => {
      db.prepare('UPDATE app_user SET api_token_hash=NULL,api_token_created_at=NULL WHERE id=?').run(req.user.id);
      db.prepare('DELETE FROM api_token_product WHERE user_id=?').run(req.user.id);
      db.prepare('DELETE FROM api_token_channel WHERE user_id=?').run(req.user.id);
    })();
    res.json({ revoked: true });
  });
  app.get('/api/v1/admin/me/api-tokens', adminAuth, (req, res) => {
    const items = db
      .prepare(
        `SELECT t.id,t.name,t.created_at createdAt,t.expires_at expiresAt,t.revoked_at revokedAt,t.last_used_at lastUsedAt,COUNT(a.id) versionsSent,(SELECT a2.version FROM ci_artifact a2 WHERE a2.api_token_id=t.id ORDER BY a2.created_at DESC LIMIT 1) lastVersion,(SELECT a2.created_at FROM ci_artifact a2 WHERE a2.api_token_id=t.id ORDER BY a2.created_at DESC LIMIT 1) lastVersionAt FROM api_token t LEFT JOIN ci_artifact a ON a.api_token_id=t.id WHERE t.user_id=? GROUP BY t.id ORDER BY t.created_at DESC`
      )
      .all(req.user.id);
    for (const item of items) {
      item.productIds = db
        .prepare('SELECT product_id FROM api_token_item_product WHERE token_id=? ORDER BY product_id')
        .all(item.id)
        .map(x => x.product_id);
      item.channels = db
        .prepare('SELECT channel FROM api_token_item_channel WHERE token_id=? ORDER BY channel')
        .all(item.id)
        .map(x => x.channel);
      item.active = !item.revokedAt && (!item.expiresAt || new Date(item.expiresAt) > new Date());
    }
    res.json(items);
  });
  app.post('/api/v1/admin/me/api-tokens', adminAuth, (req, res) => {
    const name = String(req.body.name || '').trim(),
      productIds = [...new Set((req.body.productIds || []).map(Number))],
      channels = [...new Set(req.body.channels || [])],
      expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null,
      allowed = userScopes(db, req.user);
    if (!name) return res.status(400).json({ error: 'api_token_name_required' });
    if (!productIds.length || !channels.length) return res.status(400).json({ error: 'api_token_scope_required' });
    if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()))
      return res.status(400).json({ error: 'api_token_expiration_invalid' });
    if (
      productIds.some(
        id =>
          (!allowed.all && !allowed.productIds.includes(id)) ||
          !db.prepare('SELECT 1 FROM product WHERE id=? AND active=1').get(id)
      ) ||
      channels.some(channel => !CHANNELS.includes(channel) || (!allowed.all && !allowed.channels.includes(channel)))
    )
      return res.status(403).json({ error: 'api_token_scope_denied' });
    const value = `cu_${crypto.randomBytes(32).toString('hex')}`,
      hash = crypto.createHash('sha256').update(value).digest('hex');
    const id = db.transaction(() => {
      const result = db
        .prepare('INSERT INTO api_token(user_id,name,token_hash,expires_at) VALUES(?,?,?,?)')
        .run(req.user.id, name, hash, expiresAt?.toISOString() || null);
      for (const productId of productIds)
        db.prepare('INSERT INTO api_token_item_product(token_id,product_id) VALUES(?,?)').run(
          result.lastInsertRowid,
          productId
        );
      for (const channel of channels)
        db.prepare('INSERT INTO api_token_item_channel(token_id,channel) VALUES(?,?)').run(
          result.lastInsertRowid,
          channel
        );
      return Number(result.lastInsertRowid);
    })();
    res.status(201).json({ id, name, token: value, productIds, channels, expiresAt: expiresAt?.toISOString() || null });
  });
  app.delete('/api/v1/admin/me/api-tokens/:id', adminAuth, (req, res) => {
    const result = db
      .prepare('UPDATE api_token SET revoked_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND revoked_at IS NULL')
      .run(req.params.id, req.user.id);
    if (!result.changes) return res.status(404).json({ error: 'api_token_not_found' });
    res.json({ revoked: true });
  });
  app.get('/api/v1/admin/me', adminAuth, (req, res) => res.json({ ...req.user, scopes: req.scopes }));
}
