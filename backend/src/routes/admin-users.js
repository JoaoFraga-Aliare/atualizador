import { CHANNELS, hashPassword } from '../auth.js';

// Painel: usuarios.
export function registerAdminUserRoutes(app, ctx) {
  const { db, adminAuth } = ctx;
  app.get('/api/v1/admin/users', adminAuth, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin_required' });
    res.json(
      db
        .prepare(
          `SELECT u.id,u.username,u.name,u.role,u.active,u.created_at,group_concat(DISTINCT p.name) products,group_concat(DISTINCT uc.channel) channels FROM app_user u LEFT JOIN user_product up ON up.user_id=u.id LEFT JOIN product p ON p.id=up.product_id LEFT JOIN user_channel uc ON uc.user_id=u.id GROUP BY u.id ORDER BY u.name`
        )
        .all()
    );
  });
  app.post('/api/v1/admin/users', adminAuth, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin_required' });
    const role = req.body.role === 'admin' ? 'admin' : 'operator',
      productIds = [...new Set((req.body.productIds || []).map(Number))],
      channels = [...new Set(req.body.channels || [])];
    if (role === 'operator' && (!productIds.length || !channels.length))
      return res.status(400).json({ error: 'scope_required' });
    if (channels.some(c => !CHANNELS.includes(c))) return res.status(400).json({ error: 'invalid_channel' });
    const id = db.transaction(() => {
      const r = db
        .prepare('INSERT INTO app_user(username,name,password_hash,role) VALUES(?,?,?,?)')
        .run(
          String(req.body.username || '').trim(),
          String(req.body.name || '').trim(),
          hashPassword(req.body.password),
          role
        );
      for (const productId of productIds)
        db.prepare('INSERT INTO user_product(user_id,product_id) VALUES(?,?)').run(r.lastInsertRowid, productId);
      for (const channel of channels)
        db.prepare('INSERT INTO user_channel(user_id,channel) VALUES(?,?)').run(r.lastInsertRowid, channel);
      return r.lastInsertRowid;
    })();
    res.status(201).json({ id });
  });
  app.patch('/api/v1/admin/users/:id', adminAuth, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin_required' });
    if (Number(req.params.id) === req.user.id && req.body.active === false)
      return res.status(400).json({ error: 'cannot_disable_self' });
    db.prepare('UPDATE app_user SET active=? WHERE id=?').run(req.body.active ? 1 : 0, req.params.id);
    res.json({ updated: true });
  });
}
