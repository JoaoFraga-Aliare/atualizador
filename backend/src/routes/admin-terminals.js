import fs from 'node:fs';
import { CHANNELS } from '../auth.js';

// Painel: dashboard, clientes, terminais e backups de banco.
export function registerAdminTerminalRoutes(app, ctx) {
  const {
    db,
    adminAuth,
    sendLiveCommand,
    allowedProductCodes,
    canAccessTerminal,
    databaseUploadDto,
    databaseSetting,
    databaseBackupFile,
    removeDatabaseUpload,
    pruneDatabaseUploads
  } = ctx;
  app.get('/api/v1/admin/dashboard', adminAuth, (req, res) => {
    const requested = [
        ...new Set(
          String(req.query.channel || CHANNELS.join(','))
            .split(',')
            .filter(channel => CHANNELS.includes(channel))
        )
      ],
      selected = req.scopes.all ? requested : requested.filter(channel => req.scopes.channels.includes(channel)),
      codes = allowedProductCodes(req);
    if (!selected.length) return res.json({ channels: [], clients: 0, terminals: 0, releases: 0, errors: 0 });
    const channelMarks = selected.map(() => '?').join(','),
      productWhere = req.scopes.all ? '' : `AND product_code IN (${codes.map(() => '?').join(',') || 'NULL'})`,
      clients = db
        .prepare(
          `SELECT count(DISTINCT client_id) value FROM terminal WHERE channel IN (${channelMarks}) ${productWhere}`
        )
        .get(...selected, ...(req.scopes.all ? [] : codes)).value,
      terminals = db
        .prepare(`SELECT count(*) value FROM terminal WHERE channel IN (${channelMarks}) ${productWhere}`)
        .get(...selected, ...(req.scopes.all ? [] : codes)).value,
      releases = req.scopes.all
        ? db
            .prepare(`SELECT count(*) value FROM release WHERE active=1 AND channel IN (${channelMarks})`)
            .get(...selected).value
        : db
            .prepare(
              `SELECT count(*) value FROM release WHERE active=1 AND channel IN (${channelMarks}) AND product_id IN (${req.scopes.productIds.map(() => '?').join(',') || 'NULL'})`
            )
            .get(...selected, ...req.scopes.productIds).value,
      errors = req.scopes.all
        ? db
            .prepare(
              `SELECT count(*) value FROM application_error e JOIN terminal t ON t.id=e.terminal_id WHERE e.received_at>=datetime('now','-7 days') AND t.channel IN (${channelMarks})`
            )
            .get(...selected).value
        : db
            .prepare(
              `SELECT count(*) value FROM application_error e JOIN terminal t ON t.id=e.terminal_id WHERE e.received_at>=datetime('now','-7 days') AND t.channel IN (${channelMarks}) AND e.product_code IN (${codes.map(() => '?').join(',') || 'NULL'})`
            )
            .get(...selected, ...codes).value;
    res.json({ channels: selected, clients, terminals, releases, errors });
  });
  app.get('/api/v1/admin/clients', adminAuth, (req, res) => {
    const codes = allowedProductCodes(req),
      scoped = !req.scopes.all;
    if (scoped && (!codes.length || !req.scopes.channels.length)) return res.json([]);
    const where = scoped
      ? `WHERE t.product_code IN (${codes.map(() => '?').join(',')}) AND t.channel IN (${req.scopes.channels.map(() => '?').join(',')})`
      : '';
    res.json(
      db
        .prepare(
          `SELECT c.*,count(t.id) terminal_count,max(t.last_seen_at) last_terminal_seen FROM client c JOIN terminal t ON t.client_id=c.id ${where} GROUP BY c.id ORDER BY c.last_seen_at DESC`
        )
        .all(...(scoped ? [...codes, ...req.scopes.channels] : []))
    );
  });
  app.get('/api/v1/admin/clients/:id/terminals', adminAuth, (req, res) => {
    const codes = allowedProductCodes(req);
    res.json(
      req.scopes.all
        ? db.prepare('SELECT * FROM terminal WHERE client_id=? ORDER BY last_seen_at DESC').all(req.params.id)
        : codes.length && req.scopes.channels.length
          ? db
              .prepare(
                `SELECT * FROM terminal WHERE client_id=? AND product_code IN (${codes.map(() => '?').join(',')}) AND channel IN (${req.scopes.channels.map(() => '?').join(',')}) ORDER BY last_seen_at DESC`
              )
              .all(req.params.id, ...codes, ...req.scopes.channels)
          : []
    );
  });
  app.get('/api/v1/admin/terminals/:id', adminAuth, (req, res) => {
    const terminal = db
      .prepare(
        `SELECT t.*,c.name client_name,c.document client_document FROM terminal t JOIN client c ON c.id=t.client_id WHERE t.id=?`
      )
      .get(req.params.id);
    if (!terminal) return res.status(404).json({ error: 'terminal_not_found' });
    const product = db.prepare('SELECT id FROM product WHERE code=?').get(terminal.product_code);
    if (
      !req.scopes.all &&
      (!product || !req.scopes.productIds.includes(product.id) || !req.scopes.channels.includes(terminal.channel))
    )
      return res.status(403).json({ error: 'scope_denied' });
    res.json(terminal);
  });
  app.get('/api/v1/admin/terminals/:id/logs', adminAuth, (req, res) => {
    const terminal = db.prepare('SELECT * FROM terminal WHERE id=?').get(req.params.id);
    if (!terminal) return res.status(404).json({ error: 'terminal_not_found' });
    const product = db.prepare('SELECT id FROM product WHERE code=?').get(terminal.product_code);
    if (
      !req.scopes.all &&
      (!product || !req.scopes.productIds.includes(product.id) || !req.scopes.channels.includes(terminal.channel))
    )
      return res.status(403).json({ error: 'scope_denied' });
    res.json(
      db
        .prepare(
          `SELECT e.id,e.status,e.message,e.previous_version,e.target_version,e.ip,e.created_at FROM terminal_event e WHERE e.terminal_id=? ORDER BY e.created_at DESC,e.id DESC`
        )
        .all(terminal.id)
    );
  });
  app.get('/api/v1/admin/terminals/:id/database', adminAuth, (req, res) => {
    const terminal = db.prepare('SELECT * FROM terminal WHERE id=?').get(req.params.id);
    if (!terminal) return res.status(404).json({ error: 'terminal_not_found' });
    if (!canAccessTerminal(req, terminal)) return res.status(403).json({ error: 'scope_denied' });
    db.prepare(
      'INSERT INTO terminal_database_request(terminal_id,requested_by) VALUES(?,?) ON CONFLICT(terminal_id) DO NOTHING'
    ).run(terminal.id, req.user.id);
    const state = db
      .prepare(
        `SELECT r.requested_at requestedAt,r.updated_at updatedAt,u.name requestedBy,du.id lastUploadId,du.original_name originalName,du.sha256,du.size_bytes sizeBytes,du.received_at receivedAt FROM terminal_database_request r LEFT JOIN app_user u ON u.id=r.requested_by LEFT JOIN terminal_database_upload du ON du.id=r.last_upload_id WHERE r.terminal_id=?`
      )
      .get(terminal.id);
    res.json({ requested: Boolean(state?.requestedAt), ...state });
  });
  app.post('/api/v1/admin/terminals/:id/database/request', adminAuth, (req, res) => {
    const terminal = db.prepare('SELECT * FROM terminal WHERE id=?').get(req.params.id);
    if (!terminal) return res.status(404).json({ error: 'terminal_not_found' });
    if (!canAccessTerminal(req, terminal)) return res.status(403).json({ error: 'scope_denied' });
    db.prepare(
      `INSERT INTO terminal_database_request(terminal_id,requested_by) VALUES(?,?) ON CONFLICT(terminal_id) DO UPDATE SET requested_at=CURRENT_TIMESTAMP,requested_by=excluded.requested_by,updated_at=CURRENT_TIMESTAMP`
    ).run(terminal.id, req.user.id);
    const delivered = sendLiveCommand(terminal.external_id, 'request_database_backup', {
      terminalId: terminal.external_id
    });
    res.json({ requested: true, delivered });
  });
  app.get('/api/v1/admin/terminals/:id/database/download', adminAuth, (req, res) => {
    const terminal = db.prepare('SELECT * FROM terminal WHERE id=?').get(req.params.id);
    if (!terminal) return res.status(404).json({ error: 'terminal_not_found' });
    if (!canAccessTerminal(req, terminal)) return res.status(403).json({ error: 'scope_denied' });
    const upload = db
      .prepare(
        `SELECT du.* FROM terminal_database_request r JOIN terminal_database_upload du ON du.id=r.last_upload_id WHERE r.terminal_id=?`
      )
      .get(terminal.id);
    if (!upload) return res.status(404).json({ error: 'database_backup_not_found' });
    const file = databaseBackupFile(upload);
    if (!file || !fs.existsSync(file)) return res.status(404).json({ error: 'database_backup_file_not_found' });
    res.download(file, upload.original_name);
  });
  app.get('/api/v1/admin/terminals/:id/database/history', adminAuth, (req, res) => {
    const terminal = db.prepare('SELECT * FROM terminal WHERE id=?').get(req.params.id);
    if (!terminal) return res.status(404).json({ error: 'terminal_not_found' });
    if (!canAccessTerminal(req, terminal)) return res.status(403).json({ error: 'scope_denied' });
    const items = db
      .prepare(
        `SELECT du.*,t.name terminal_name,t.computer_name FROM terminal_database_upload du JOIN terminal t ON t.id=du.terminal_id WHERE du.terminal_id=? ORDER BY du.received_at DESC,du.id DESC`
      )
      .all(terminal.id)
      .map(databaseUploadDto);
    res.json({ items, setting: databaseSetting() });
  });
  app.get('/api/v1/admin/terminals/:id/live-events', adminAuth, (req, res) => {
    const terminal = db.prepare('SELECT * FROM terminal WHERE id=?').get(req.params.id);
    if (!terminal) return res.status(404).json({ error: 'terminal_not_found' });
    if (!canAccessTerminal(req, terminal)) return res.status(403).json({ error: 'scope_denied' });
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500),
      items = db
        .prepare(
          `SELECT id,type,name,operation,value_text value,received_at receivedAt,ip FROM terminal_live_event WHERE terminal_id=? ORDER BY received_at DESC,id DESC LIMIT ?`
        )
        .all(terminal.id, limit);
    res.json({ items });
  });
  app.get('/api/v1/admin/clients/:id/database/history', adminAuth, (req, res) => {
    const client = db.prepare('SELECT * FROM client WHERE id=?').get(req.params.id);
    if (!client) return res.status(404).json({ error: 'client_not_found' });
    const terminals = req.scopes.all
      ? db.prepare('SELECT * FROM terminal WHERE client_id=? ORDER BY name').all(client.id)
      : db
          .prepare(
            `SELECT * FROM terminal WHERE client_id=? AND product_code IN (${
              allowedProductCodes(req)
                .map(() => '?')
                .join(',') || 'NULL'
            }) AND channel IN (${req.scopes.channels.map(() => '?').join(',') || 'NULL'}) ORDER BY name`
          )
          .all(client.id, ...allowedProductCodes(req), ...req.scopes.channels);
    const items = terminals.map(terminal => ({
      terminal,
      items: db
        .prepare(
          `SELECT du.*,t.name terminal_name,t.computer_name FROM terminal_database_upload du JOIN terminal t ON t.id=du.terminal_id WHERE du.terminal_id=? ORDER BY du.received_at DESC,du.id DESC`
        )
        .all(terminal.id)
        .map(databaseUploadDto)
    }));
    res.json({ items, setting: databaseSetting() });
  });
  app.get('/api/v1/admin/database/uploads/:id/download', adminAuth, (req, res) => {
    const upload = db
      .prepare(
        `SELECT du.*,t.product_code,t.channel FROM terminal_database_upload du JOIN terminal t ON t.id=du.terminal_id WHERE du.id=?`
      )
      .get(req.params.id);
    if (!upload) return res.status(404).json({ error: 'database_backup_not_found' });
    if (!canAccessTerminal(req, upload)) return res.status(403).json({ error: 'scope_denied' });
    const file = databaseBackupFile(upload);
    if (!file || !fs.existsSync(file)) return res.status(404).json({ error: 'database_backup_file_not_found' });
    res.download(file, upload.original_name);
  });
  app.delete('/api/v1/admin/database/uploads/:id', adminAuth, (req, res) => {
    const upload = db
      .prepare(
        `SELECT du.*,t.product_code,t.channel FROM terminal_database_upload du JOIN terminal t ON t.id=du.terminal_id WHERE du.id=?`
      )
      .get(req.params.id);
    if (!upload) return res.status(404).json({ error: 'database_backup_not_found' });
    if (!canAccessTerminal(req, upload)) return res.status(403).json({ error: 'scope_denied' });
    removeDatabaseUpload(upload);
    res.json({ deleted: true });
  });
  app.get('/api/v1/admin/database/settings', adminAuth, (_req, res) => res.json(databaseSetting()));
  app.patch('/api/v1/admin/database/settings', adminAuth, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin_required' });
    const retentionDays = Math.max(0, Math.min(Number(req.body.retentionDays) || 0, 3650)),
      retentionCount = Math.max(0, Math.min(Number(req.body.retentionCount) || 0, 1000));
    if (!retentionDays && !retentionCount) return res.status(400).json({ error: 'retention_required' });
    db.prepare(
      'UPDATE terminal_database_setting SET retention_days=?,retention_count=?,updated_at=CURRENT_TIMESTAMP WHERE id=1'
    ).run(retentionDays, retentionCount);
    for (const row of db.prepare('SELECT id FROM terminal').all()) pruneDatabaseUploads(row.id);
    res.json(databaseSetting());
  });
}
