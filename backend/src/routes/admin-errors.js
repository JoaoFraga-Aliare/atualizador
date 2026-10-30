import { isRegressionAfterFix } from '../version.js';
import { textValue } from '../lib/util.js';
import { normalizeScreenshot, decryptStoredError, errorSignature } from '../lib/error-crypto.js';
import { publicTerminal } from '../terminal-keys.js';
import { analyzeError } from '../map-resolver.js';
import path from 'node:path';

// Painel: erros de producao e notificacoes.
export function registerAdminErrorRoutes(app, ctx) {
  const { db, adminAuth, allowedProductCodes, packagesPath } = ctx;
  app.get('/api/v1/admin/errors/settings', adminAuth, (_req, res) => {
    const setting = db.prepare('SELECT store_screenshot FROM error_setting WHERE id=1').get();
    res.json({ storeScreenshot: Boolean(setting?.store_screenshot) });
  });
  app.patch('/api/v1/admin/errors/settings', adminAuth, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin_required' });
    db.prepare('UPDATE error_setting SET store_screenshot=? WHERE id=1').run(req.body.storeScreenshot ? 1 : 0);
    res.json({ updated: true, storeScreenshot: Boolean(req.body.storeScreenshot) });
  });
  app.get('/api/v1/admin/notification-reads', adminAuth, (req, res) =>
    res.json(
      db.prepare('SELECT notification_key key,read_at readAt FROM notification_read WHERE user_id=?').all(req.user.id)
    )
  );
  app.post('/api/v1/admin/notification-reads', adminAuth, (req, res) => {
    const key = textValue(req.body.key);
    if (!key || key.length > 100) return res.status(400).json({ error: 'invalid_notification_key' });
    db.prepare(
      'INSERT INTO notification_read(user_id,notification_key) VALUES(?,?) ON CONFLICT(user_id,notification_key) DO UPDATE SET read_at=CURRENT_TIMESTAMP'
    ).run(req.user.id, key);
    res.json({ read: true, key });
  });
  app.get('/api/v1/admin/notifications', adminAuth, (req, res) => {
    const codes = allowedProductCodes(req),
      scoped = !req.scopes.all;
    if (scoped && !codes.length) return res.json({ items: [], count: 0 });
    const rows = db
        .prepare(
          `SELECT e.*,c.name client_name,t.name registered_terminal_name,t.channel,r.id fixed_release_id,r.version fixed_version,er.signature fixed_signature FROM application_error e JOIN error_rule er ON er.product_code=e.product_code AND er.ignored=0 JOIN release r ON r.id=er.fixed_release_id LEFT JOIN terminal t ON t.id=e.terminal_id LEFT JOIN client c ON c.id=t.client_id WHERE e.encrypted_payload IS NOT NULL ${scoped ? `AND e.product_code IN (${codes.map(() => '?').join(',')}) AND t.channel IN (${req.scopes.channels.map(() => '?').join(',') || 'NULL'})` : ''} ORDER BY e.received_at DESC LIMIT 1000`
        )
        .all(...(scoped ? [...codes, ...req.scopes.channels] : [])),
      items = [];
    for (const row of rows) {
      let decrypted;
      try {
        decrypted = decryptStoredError(row);
        const exception = textValue(decrypted.payload.exceptionClass || decrypted.payload.exception),
          message = textValue(decrypted.payload.message),
          version = textValue(decrypted.payload.version);
        if (
          exception &&
          message &&
          version &&
          errorSignature(exception, message) === row.fixed_signature &&
          isRegressionAfterFix(row.executable_hash_status, version, row.fixed_version)
        )
          items.push({
            id: row.id,
            receivedAt: row.received_at,
            client: row.client_name || 'Não identificado',
            terminal: textValue(decrypted.payload.terminal) || row.registered_terminal_name || '-',
            productCode: row.product_code,
            channel: row.channel || '-',
            version,
            exception,
            message,
            fixedVersion: row.fixed_version
          });
      } catch {
      } finally {
        if (decrypted) {
          decrypted.plain.fill(0);
          decrypted.key.fill(0);
        }
      }
    }
    res.json({ items, count: items.length });
  });
  app.get('/api/v1/admin/hash-notifications', adminAuth, (req, res) => {
    const codes = allowedProductCodes(req),
      scoped = !req.scopes.all;
    if (scoped && !codes.length) return res.json({ items: [], count: 0 });
    const scope = scoped
        ? `AND e.product_code IN (${codes.map(() => '?').join(',')}) AND t.channel IN (${req.scopes.channels.map(() => '?').join(',') || 'NULL'})`
        : '',
      rows = db
        .prepare(
          `SELECT e.*,c.name client_name,t.name registered_terminal_name,t.channel,r.version detected_version FROM application_error e LEFT JOIN terminal t ON t.id=e.terminal_id LEFT JOIN client c ON c.id=t.client_id LEFT JOIN release r ON r.id=e.detected_release_id WHERE e.executable_hash_status IN ('unauthorized','version_mismatch') ${scope} ORDER BY e.received_at DESC LIMIT 500`
        )
        .all(...(scoped ? [...codes, ...req.scopes.channels] : [])),
      items = [];
    for (const row of rows) {
      let decrypted;
      try {
        decrypted = decryptStoredError(row);
        items.push({
          id: row.id,
          type: 'executable_hash',
          receivedAt: row.received_at,
          client: row.client_name || 'Não identificado',
          terminal: textValue(decrypted.payload.terminal) || row.registered_terminal_name || '-',
          productCode: row.product_code,
          channel: row.channel || '-',
          version: textValue(decrypted.payload.reportedVersion || decrypted.payload.version) || '-',
          resolvedVersion: textValue(decrypted.payload.version) || '-',
          exception: textValue(decrypted.payload.exceptionClass || decrypted.payload.exception) || 'Hash divergente',
          message: textValue(decrypted.payload.message) || '-',
          reportedHash: row.reported_executable_sha256,
          detectedVersion: row.detected_version || null,
          hashStatus: row.executable_hash_status
        });
      } catch {
      } finally {
        if (decrypted) {
          decrypted.plain.fill(0);
          decrypted.key.fill(0);
        }
      }
    }
    res.json({ items, count: items.length });
  });
  app.get('/api/v1/admin/terminals/:id/errors/analysis', adminAuth, (req, res) => {
    try {
      const terminal = db.prepare('SELECT * FROM terminal WHERE id=?').get(req.params.id);
      if (!terminal) return res.status(404).json({ error: 'terminal_not_found' });
      const productAccess = db.prepare('SELECT id FROM product WHERE code=?').get(terminal.product_code);
      if (
        !req.scopes.all &&
        (!productAccess ||
          !req.scopes.productIds.includes(productAccess.id) ||
          !req.scopes.channels.includes(terminal.channel))
      )
        return res.status(403).json({ error: 'scope_denied' });
      const today = new Date(),
        defaultStart = new Date(today.getTime() - 29 * 86400000),
        parseDay = (value, fallback) => {
          const date = value ? new Date(`${value}T00:00:00`) : fallback;
          if (Number.isNaN(date.getTime())) throw new Error('invalid_error_period');
          return date;
        },
        start = parseDay(req.query.startDate, defaultStart),
        end = parseDay(req.query.endDate, today),
        days = Math.floor((end - start) / 86400000) + 1;
      if (days < 1 || days > 90) throw new Error('error_period_must_be_between_1_and_90_days');
      const endExclusive = new Date(end.getTime() + 86400000);
      const rows = db
          .prepare(
            `SELECT e.*,c.name client_name,t.name registered_terminal_name,t.channel,p.name product_name FROM application_error e JOIN terminal t ON t.id=e.terminal_id LEFT JOIN client c ON c.id=t.client_id LEFT JOIN product p ON p.code=e.product_code WHERE e.terminal_id=? AND e.received_at>=? AND e.received_at<? AND e.encrypted_payload IS NOT NULL ORDER BY e.received_at DESC,e.id DESC`
          )
          .all(terminal.id, start.toISOString(), endExclusive.toISOString()),
        valid = [];
      let invalidCount = 0;
      for (const row of rows) {
        let decrypted;
        try {
          decrypted = decryptStoredError(row);
          const payload = decrypted.payload,
            exceptionClass = textValue(payload.exceptionClass || payload.exception),
            message = textValue(payload.message);
          if (!exceptionClass || !message) {
            invalidCount++;
            continue;
          }
          const version =
              row.executable_hash_status === 'unauthorized' ? 'Não homologada' : textValue(payload.version) || '-',
            client = row.client_name || 'Não identificado',
            product = row.product_name || row.product_code,
            channel = row.channel || 'Não identificado',
            terminalName = textValue(payload.terminal) || row.registered_terminal_name || '-',
            signature = errorSignature(exceptionClass, message);
          valid.push({
            id: row.id,
            receivedAt: row.received_at,
            date: payload.date || payload.data || null,
            exception: exceptionClass,
            message,
            version,
            reportedVersion: textValue(payload.reportedVersion) || textValue(payload.version),
            hashStatus: row.executable_hash_status,
            client,
            product,
            productCode: row.product_code,
            channel,
            terminal: terminalName,
            hasScreenshot: Boolean(row.screenshot_mime),
            signature
          });
        } catch {
          invalidCount++;
        } finally {
          if (decrypted) {
            decrypted.plain.fill(0);
            decrypted.key.fill(0);
          }
        }
      }
      const visible =
          req.query.includeIgnored === 'true'
            ? valid
            : valid.filter(
                x =>
                  !db
                    .prepare('SELECT ignored FROM error_rule WHERE signature=? AND product_code=?')
                    .get(x.signature, x.productCode)?.ignored
              ),
        unique = values => [...new Set(values)].sort((a, b) => a.localeCompare(b, 'pt-BR')),
        options = {
          exceptions: unique(visible.map(x => x.exception)),
          clients: unique(visible.map(x => x.client)),
          versions: unique(visible.map(x => x.version)),
          products: unique(visible.map(x => x.product)),
          channels: unique(visible.map(x => x.channel))
        },
        selected = {
          exception: req.query.exception,
          client: req.query.client,
          version: req.query.version,
          product: req.query.product,
          channel: req.query.channel
        },
        filtered = visible.filter(
          x =>
            (!selected.exception || x.exception === selected.exception) &&
            (!selected.client || x.client === selected.client) &&
            (!selected.version || x.version === selected.version) &&
            (!selected.product || x.product === selected.product) &&
            (!selected.channel || x.channel === selected.channel)
        ),
        groups = new Map();
      for (const item of filtered) {
        const key = [item.signature, item.client, item.version, item.product, item.channel].join('|'),
          current = groups.get(key),
          screenshot = item.hasScreenshot
            ? { id: item.id, client: item.client, terminal: item.terminal, receivedAt: item.receivedAt }
            : null;
        if (current) {
          current.occurrences++;
          if (screenshot) current.screenshots.push(screenshot);
          if (item.receivedAt > current.receivedAt) {
            current.id = item.id;
            current.receivedAt = item.receivedAt;
            current.date = item.date;
            current.hasScreenshot = item.hasScreenshot;
          }
        } else groups.set(key, { ...item, occurrences: 1, screenshots: screenshot ? [screenshot] : [] });
      }
      const items = [...groups.values()].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)),
        chart = field => {
          const map = new Map();
          for (const item of filtered) {
            const signatures = map.get(item[field]) || new Set();
            signatures.add(item.signature);
            map.set(item[field], signatures);
          }
          return [...map]
            .map(([label, signatures]) => ({ label, count: signatures.size }))
            .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'));
        };
      res.json({
        items,
        options,
        charts: { byException: chart('exception'), byClient: chart('client') },
        uniqueCount: new Set(filtered.map(x => x.signature)).size,
        occurrenceCount: filtered.length,
        invalidCount,
        terminal: { id: terminal.id, name: terminal.name },
        period: {
          startDate: req.query.startDate || start.toISOString().slice(0, 10),
          endDate: req.query.endDate || end.toISOString().slice(0, 10),
          maxDays: 90
        }
      });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.get('/api/v1/admin/errors/analysis', adminAuth, (req, res) => {
    try {
      const today = new Date(),
        defaultStart = new Date(today.getTime() - 29 * 86400000),
        parseDay = (value, fallback) => {
          const date = value ? new Date(`${value}T00:00:00`) : fallback;
          if (Number.isNaN(date.getTime())) throw new Error('invalid_error_period');
          return date;
        },
        start = parseDay(req.query.startDate, defaultStart),
        end = parseDay(req.query.endDate, today),
        days = Math.floor((end - start) / 86400000) + 1;
      if (days < 1 || days > 90) throw new Error('error_period_must_be_between_1_and_90_days');
      const endExclusive = new Date(end.getTime() + 86400000),
        codes = allowedProductCodes(req),
        scoped = !req.scopes.all;
      if (scoped && (!codes.length || !req.scopes.channels.length))
        return res.json({
          items: [],
          options: { exceptions: [], clients: [], versions: [], products: [], channels: [] },
          charts: { byException: [], byClient: [] },
          uniqueCount: 0,
          occurrenceCount: 0,
          invalidCount: 0
        });
      const scope = scoped
          ? `AND e.product_code IN (${codes.map(() => '?').join(',')}) AND t.channel IN (${req.scopes.channels.map(() => '?').join(',')})`
          : '',
        rows = db
          .prepare(
            `SELECT e.*,c.name client_name,t.name registered_terminal_name,t.channel,p.name product_name FROM application_error e LEFT JOIN terminal t ON t.id=e.terminal_id LEFT JOIN client c ON c.id=t.client_id LEFT JOIN product p ON p.code=e.product_code WHERE e.received_at>=? AND e.received_at<? AND e.encrypted_payload IS NOT NULL ${scope} ORDER BY e.received_at DESC,e.id DESC`
          )
          .all(start.toISOString(), endExclusive.toISOString(), ...(scoped ? [...codes, ...req.scopes.channels] : [])),
        valid = [];
      let invalidCount = 0;
      for (const row of rows) {
        let decrypted;
        try {
          decrypted = decryptStoredError(row);
          const payload = decrypted.payload,
            exceptionClass = textValue(payload.exceptionClass || payload.exception),
            message = textValue(payload.message);
          if (!exceptionClass || !message) {
            invalidCount++;
            continue;
          }
          const version =
              row.executable_hash_status === 'unauthorized' ? 'Não homologada' : textValue(payload.version) || '-',
            client = row.client_name || 'Não identificado',
            product = row.product_name || row.product_code,
            channel = row.channel || 'Não identificado',
            terminal = textValue(payload.terminal) || row.registered_terminal_name || '-',
            signature = errorSignature(exceptionClass, message);
          valid.push({
            id: row.id,
            receivedAt: row.received_at,
            date: payload.date || payload.data || null,
            exception: exceptionClass,
            message,
            version,
            reportedVersion: textValue(payload.reportedVersion) || textValue(payload.version),
            hashStatus: row.executable_hash_status,
            client,
            product,
            productCode: row.product_code,
            channel,
            terminal,
            hasScreenshot: Boolean(row.screenshot_mime),
            signature
          });
        } catch {
          invalidCount++;
        } finally {
          if (decrypted) {
            decrypted.plain.fill(0);
            decrypted.key.fill(0);
          }
        }
      }
      const visible =
          req.query.includeIgnored === 'true'
            ? valid
            : valid.filter(
                x =>
                  !db
                    .prepare('SELECT ignored FROM error_rule WHERE signature=? AND product_code=?')
                    .get(x.signature, x.productCode)?.ignored
              ),
        unique = values => [...new Set(values)].sort((a, b) => a.localeCompare(b, 'pt-BR')),
        options = {
          exceptions: unique(visible.map(x => x.exception)),
          clients: unique(visible.map(x => x.client)),
          versions: unique(visible.map(x => x.version)),
          products: unique(visible.map(x => x.product)),
          channels: unique(visible.map(x => x.channel))
        },
        selected = {
          exception: req.query.exception,
          client: req.query.client,
          version: req.query.version,
          product: req.query.product,
          channel: req.query.channel
        },
        filtered = visible.filter(
          x =>
            (!selected.exception || x.exception === selected.exception) &&
            (!selected.client || x.client === selected.client) &&
            (!selected.version || x.version === selected.version) &&
            (!selected.product || x.product === selected.product) &&
            (!selected.channel || x.channel === selected.channel)
        ),
        groups = new Map();
      for (const item of filtered) {
        const key = [item.signature, item.client, item.version, item.product, item.channel].join('|'),
          current = groups.get(key),
          screenshot = item.hasScreenshot
            ? { id: item.id, client: item.client, terminal: item.terminal, receivedAt: item.receivedAt }
            : null;
        if (current) {
          current.occurrences++;
          if (screenshot) current.screenshots.push(screenshot);
          if (item.receivedAt > current.receivedAt) {
            current.id = item.id;
            current.receivedAt = item.receivedAt;
            current.date = item.date;
            current.hasScreenshot = item.hasScreenshot;
          }
        } else groups.set(key, { ...item, occurrences: 1, screenshots: screenshot ? [screenshot] : [] });
      }
      const items = [...groups.values()].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)),
        chart = field => {
          const map = new Map();
          for (const item of filtered) {
            const signatures = map.get(item[field]) || new Set();
            signatures.add(item.signature);
            map.set(item[field], signatures);
          }
          return [...map]
            .map(([label, signatures]) => ({ label, count: signatures.size }))
            .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'));
        };
      res.json({
        items,
        options,
        charts: { byException: chart('exception'), byClient: chart('client') },
        uniqueCount: new Set(filtered.map(x => x.signature)).size,
        occurrenceCount: filtered.length,
        invalidCount,
        period: {
          startDate: req.query.startDate || start.toISOString().slice(0, 10),
          endDate: req.query.endDate || end.toISOString().slice(0, 10),
          maxDays: 90
        }
      });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.get('/api/v1/admin/errors', adminAuth, (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500),
      codes = allowedProductCodes(req),
      scoped = !req.scopes.all;
    if (scoped && (!codes.length || !req.scopes.channels.length)) return res.json([]);
    const where = scoped
      ? `WHERE e.product_code IN (${codes.map(() => '?').join(',')}) AND t.channel IN (${req.scopes.channels.map(() => '?').join(',')})`
      : '';
    res.json(
      db
        .prepare(
          `SELECT e.id,e.product_code,e.received_at,e.screenshot_mime IS NOT NULL has_screenshot,c.name client_name,t.name registered_terminal_name FROM application_error e LEFT JOIN terminal t ON t.id=e.terminal_id LEFT JOIN client c ON c.id=t.client_id ${where} ORDER BY e.received_at DESC,e.id DESC LIMIT ?`
        )
        .all(...(scoped ? [...codes, ...req.scopes.channels] : []), limit)
    );
  });
  app.use('/api/v1/admin/errors/:id', adminAuth, (req, res, next) => {
    if (req.scopes.all) return next();
    const error = db
      .prepare(
        `SELECT p.id product_id,t.channel FROM application_error e LEFT JOIN product p ON p.code=e.product_code LEFT JOIN terminal t ON t.id=e.terminal_id WHERE e.id=?`
      )
      .get(req.params.id);
    if (!error) return res.status(404).json({ error: 'error_not_found' });
    if (!req.scopes.productIds.includes(error.product_id) || !req.scopes.channels.includes(error.channel))
      return res.status(403).json({ error: 'scope_denied' });
    next();
  });
  app.get('/api/v1/admin/errors/:id', adminAuth, (req, res) => {
    const error = db
      .prepare(
        `SELECT e.*,c.name client_name,t.external_id terminal_external_id FROM application_error e LEFT JOIN terminal t ON t.id=e.terminal_id LEFT JOIN client c ON c.id=t.client_id WHERE e.id=?`
      )
      .get(req.params.id);
    if (!error) return res.status(404).json({ error: 'error_not_found' });
    const product = db.prepare('SELECT id FROM product WHERE code=?').get(error.product_code);
    if (!req.scopes.all && (!product || !req.scopes.productIds.includes(product.id)))
      return res.status(403).json({ error: 'scope_denied' });
    let decrypted;
    try {
      decrypted = decryptStoredError(error);
      const payload = { ...decrypted.payload };
      delete payload.screenshotBase64;
      delete payload.base64;
      delete payload.print;
      const exception = textValue(payload.exceptionClass || payload.exception),
        message = textValue(payload.message),
        signature = errorSignature(exception, message),
        rule = db
          .prepare(
            `SELECT er.ignored,er.fixed_release_id,r.version fixed_version FROM error_rule er LEFT JOIN release r ON r.id=er.fixed_release_id WHERE er.signature=? AND er.product_code=?`
          )
          .get(signature, error.product_code),
        releases = db
          .prepare(
            `SELECT r.id,r.version,r.channel FROM release r JOIN product p ON p.id=r.product_id WHERE p.code=? ORDER BY r.published_at DESC,r.id DESC`
          )
          .all(error.product_code);
      const packageRelease =
          (error.detected_release_id &&
            db
              .prepare('SELECT file_path FROM release WHERE id=? AND deleted_at IS NULL')
              .get(error.detected_release_id)) ||
          (payload.version &&
            db
              .prepare(
                `SELECT r.file_path FROM release r JOIN product p ON p.id=r.product_id WHERE p.code=? AND r.version=? AND r.artifact_type='package' AND r.deleted_at IS NULL ORDER BY r.published_at DESC,r.id DESC`
              )
              .get(error.product_code, String(payload.version))),
        packageFile = packageRelease ? path.resolve(packagesPath, packageRelease.file_path) : null,
        mapAnalysis = analyzeError({
          payload,
          productCode: error.product_code,
          packageFile: packageFile?.startsWith(packagesPath + path.sep) ? packageFile : null
        });
      res.set('Cache-Control', 'no-store, private').json({
        id: error.id,
        product_code: error.product_code,
        received_at: error.received_at,
        client_name: error.client_name,
        terminal_external_id: error.terminal_external_id,
        hasScreenshot: Boolean(error.screenshot_mime),
        classification: {
          ignored: Boolean(rule?.ignored),
          fixedReleaseId: rule?.fixed_release_id || null,
          fixedVersion: rule?.fixed_version || null
        },
        releases,
        ...payload,
        mapAnalysis
      });
    } finally {
      if (decrypted) {
        decrypted.plain.fill(0);
        decrypted.key.fill(0);
      }
    }
  });
  app.patch('/api/v1/admin/errors/:id/classification', adminAuth, (req, res) => {
    const error = db.prepare('SELECT * FROM application_error WHERE id=?').get(req.params.id);
    if (!error) return res.status(404).json({ error: 'error_not_found' });
    let decrypted;
    try {
      decrypted = decryptStoredError(error);
      const exception = textValue(decrypted.payload.exceptionClass || decrypted.payload.exception),
        message = textValue(decrypted.payload.message),
        signature = errorSignature(exception, message),
        ignored = req.body.ignored ? 1 : 0,
        fixedReleaseId = req.body.fixedReleaseId ? Number(req.body.fixedReleaseId) : null;
      if (
        fixedReleaseId &&
        !db
          .prepare(`SELECT 1 FROM release r JOIN product p ON p.id=r.product_id WHERE r.id=? AND p.code=?`)
          .get(fixedReleaseId, error.product_code)
      )
        return res.status(400).json({ error: 'invalid_fixed_release' });
      db.prepare(
        `INSERT INTO error_rule(signature,product_code,ignored,fixed_release_id,created_by) VALUES(?,?,?,?,?) ON CONFLICT(signature,product_code) DO UPDATE SET ignored=excluded.ignored,fixed_release_id=excluded.fixed_release_id,created_by=excluded.created_by,updated_at=CURRENT_TIMESTAMP`
      ).run(signature, error.product_code, ignored, fixedReleaseId, req.user.id);
      res.json({ updated: true, ignored: Boolean(ignored), fixedReleaseId });
    } finally {
      if (decrypted) {
        decrypted.plain.fill(0);
        decrypted.key.fill(0);
      }
    }
  });
  app.get('/api/v1/admin/errors/:id/terminal', adminAuth, (req, res) => {
    const terminal = db
      .prepare(
        `SELECT t.*,c.name client_name,c.document client_document FROM application_error e JOIN terminal t ON t.id=e.terminal_id JOIN client c ON c.id=t.client_id WHERE e.id=?`
      )
      .get(req.params.id);
    if (!terminal) return res.status(404).json({ error: 'terminal_not_found' });
    res.json(publicTerminal(terminal));
  });
  app.get('/api/v1/admin/errors/:id/screenshot', adminAuth, (req, res) => {
    const error = db.prepare('SELECT * FROM application_error WHERE id=?').get(req.params.id);
    if (!error) return res.status(404).json({ error: 'error_not_found' });
    const product = db.prepare('SELECT id FROM product WHERE code=?').get(error.product_code);
    if (!req.scopes.all && (!product || !req.scopes.productIds.includes(product.id)))
      return res.status(403).json({ error: 'scope_denied' });
    let decrypted;
    try {
      decrypted = decryptStoredError(error);
      const screenshot = normalizeScreenshot(decrypted.payload.screenshotBase64);
      if (!screenshot) return res.status(404).json({ error: 'screenshot_not_stored' });
      const image = Buffer.from(screenshot.base64, 'base64');
      res
        .type(screenshot.mime)
        .set('Cache-Control', 'no-store, private')
        .set('Content-Disposition', 'inline')
        .end(image, () => image.fill(0));
    } finally {
      if (decrypted) {
        decrypted.plain.fill(0);
        decrypted.key.fill(0);
      }
    }
  });
}
