import fs from 'node:fs';
import path from 'node:path';
import { normalizeFutureDeadline, normalizeRolloutPercent } from '../release.js';
import { CHANNELS, canAccess } from '../auth.js';
import { addGeneratedManifest } from '../package-manifest.js';
import { releaseAnalytics, softDeleteRelease } from '../release-history.js';
import { hashFileSync, textValue } from '../lib/util.js';
import { decryptStoredError, errorSignature } from '../lib/error-crypto.js';

// Painel: produtos e publicacoes.
export function registerAdminReleaseRoutes(app, ctx) {
  const { db, packagesPath, upload, releaseSigner, adminAuth, allowedProducts } = ctx;
  app.get('/api/v1/admin/products', adminAuth, (req, res) => res.json(allowedProducts(req)));
  app.post('/api/v1/admin/products', adminAuth, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin_required' });
    const r = db.prepare('INSERT INTO product(code,name) VALUES(?,?)').run(req.body.code, req.body.name);
    res.status(201).json({ id: r.lastInsertRowid });
  });
  app.delete('/api/v1/admin/products/:id', adminAuth, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin_required' });
    const product = db.prepare('SELECT * FROM product WHERE id=?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'product_not_found' });
    if (
      db.prepare('SELECT 1 FROM release WHERE product_id=? LIMIT 1').get(product.id) ||
      db.prepare('SELECT 1 FROM terminal WHERE product_code=? LIMIT 1').get(product.code)
    )
      return res.status(409).json({ error: 'product_in_use' });
    db.prepare('DELETE FROM product WHERE id=?').run(product.id);
    res.json({ deleted: true });
  });
  app.get('/api/v1/admin/products/:id/delete-impact', adminAuth, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin_required' });
    const product = db.prepare('SELECT * FROM product WHERE id=?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'product_not_found' });
    res.json({
      canDelete:
        !db.prepare('SELECT 1 FROM release WHERE product_id=? LIMIT 1').get(product.id) &&
        !db.prepare('SELECT 1 FROM terminal WHERE product_code=? LIMIT 1').get(product.code),
      releases: db.prepare('SELECT count(*) value FROM release WHERE product_id=?').get(product.id).value,
      terminals: db.prepare('SELECT count(*) value FROM terminal WHERE product_code=?').get(product.code).value
    });
  });
  app.get('/api/v1/admin/releases', adminAuth, (req, res) => {
    const { productId, channel } = req.query;
    let where = [],
      args = [];
    if (!req.scopes.all) {
      where.push(
        `r.product_id IN (${req.scopes.productIds.map(() => '?').join(',') || 'NULL'})`,
        `r.channel IN (${req.scopes.channels.map(() => '?').join(',') || 'NULL'})`
      );
      args.push(...req.scopes.productIds, ...req.scopes.channels);
    }
    if (productId) {
      where.push('r.product_id=?');
      args.push(productId);
    }
    if (channel) {
      where.push('r.channel=?');
      args.push(channel);
    }
    res.json(
      db
        .prepare(
          `SELECT r.*,p.name product_name,group_concat(CASE WHEN rt.target_type='all' THEN 'Todos' ELSE c.name END,', ') targets,(SELECT count(*) FROM terminal t WHERE t.product_code=p.code AND t.channel=r.channel AND t.current_version=r.version) terminal_count FROM release r JOIN product p ON p.id=r.product_id JOIN release_target rt ON rt.release_id=r.id LEFT JOIN client c ON c.id=rt.client_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} GROUP BY r.id ORDER BY r.published_at DESC`
        )
        .all(...args)
    );
  });
  app.get('/api/v1/admin/releases/:id/details', adminAuth, (req, res) => {
    const release = db
      .prepare(
        `SELECT r.*,p.name product_name,p.code product_code,u.name published_by_name,group_concat(CASE WHEN rt.target_type='all' THEN 'Todos os clientes' ELSE c.name END,', ') targets FROM release r JOIN product p ON p.id=r.product_id JOIN release_target rt ON rt.release_id=r.id LEFT JOIN client c ON c.id=rt.client_id LEFT JOIN app_user u ON u.id=r.published_by WHERE r.id=? GROUP BY r.id`
      )
      .get(req.params.id);
    if (!release) return res.status(404).json({ error: 'release_not_found' });
    if (!canAccess(req.scopes, release.product_id, release.channel))
      return res.status(403).json({ error: 'scope_denied' });
    const successful = "'installed','updated','success'",
      installations = db
        .prepare(
          `SELECT date(e.created_at,'localtime') day,c.id client_id,c.name client_name,t.id terminal_id,t.name terminal_name,t.computer_name,e.created_at FROM terminal_event e JOIN terminal t ON t.id=e.terminal_id JOIN client c ON c.id=t.client_id WHERE e.release_id=? AND e.status IN (${successful}) ORDER BY e.created_at DESC`
        )
        .all(release.id),
      days = db
        .prepare(
          `SELECT date(e.created_at,'localtime') day,count(DISTINCT t.client_id) client_count,count(DISTINCT e.terminal_id) terminal_count FROM terminal_event e JOIN terminal t ON t.id=e.terminal_id WHERE e.release_id=? AND e.status IN (${successful}) GROUP BY date(e.created_at,'localtime') ORDER BY day DESC`
        )
        .all(release.id);
    res.json({
      ...release,
      days,
      installations,
      analytics: releaseAnalytics(db, release, decryptStoredError, errorSignature)
    });
  });
  app.get('/api/v1/admin/logs', adminAuth, (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500),
      ids = req.scopes.productIds;
    res.json(
      db
        .prepare(
          `SELECT e.id,e.status,e.message,e.previous_version,e.target_version,e.ip,e.created_at,t.name terminal_name,t.computer_name,c.name client_name,r.artifact_type,p.name product_name FROM terminal_event e LEFT JOIN terminal t ON t.id=e.terminal_id LEFT JOIN client c ON c.id=t.client_id LEFT JOIN release r ON r.id=e.release_id LEFT JOIN product p ON p.id=r.product_id ${req.scopes.all ? '' : `WHERE (r.product_id IN (${ids.map(() => '?').join(',') || 'NULL'}) OR t.product_code IN (SELECT code FROM product WHERE id IN (${ids.map(() => '?').join(',') || 'NULL'})))`} ORDER BY e.created_at DESC,e.id DESC LIMIT ?`
        )
        .all(...(req.scopes.all ? [] : [...ids, ...ids]), limit)
    );
  });
  app.post(
    '/api/v1/admin/releases',
    adminAuth,
    upload.fields([
      { name: 'artifact', maxCount: 1 },
      { name: 'package', maxCount: 1 }
    ]),
    (req, res, next) => {
      const file = req.files?.artifact?.[0] || req.files?.package?.[0],
        artifactId = textValue(req.body.artifactId);
      let final,
        ownsFinal = false,
        inTransaction = false,
        ciArtifact;
      try {
        const artifactType = req.body.artifactType === 'sql' ? 'sql' : 'package',
          expectedExtension = artifactType === 'sql' ? '.sql' : '.zip',
          sqlContent = String(req.body.sqlContent || '').trim();
        if (artifactId) {
          if (artifactType !== 'package' || file) throw new Error('invalid_artifact_selection');
          ciArtifact = db
            .prepare(
              `SELECT * FROM ci_artifact WHERE id=? ${req.user.role === 'admin' ? '' : 'AND user_id=?'} AND consumed_at IS NULL`
            )
            .get(artifactId, ...(req.user.role === 'admin' ? [] : [req.user.id]));
          if (!ciArtifact) throw new Error('artifact_not_found');
        }
        if (
          artifactType === 'package' &&
          ((!artifactId && !file) || (file && path.extname(file.originalname).toLowerCase() !== '.zip'))
        )
          throw new Error('zip_required');
        if (
          artifactType === 'sql' &&
          !sqlContent &&
          (!file || path.extname(file.originalname).toLowerCase() !== '.sql')
        )
          throw new Error('sql_required');
        if (!['test', 'beta', 'production'].includes(req.body.channel)) throw new Error('invalid_channel');
        const product = db.prepare('SELECT * FROM product WHERE id=?').get(req.body.productId);
        if (!product) throw new Error('product_not_found');
        if (!canAccess(req.scopes, product.id, req.body.channel)) {
          if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
          return res.status(403).json({ error: 'scope_denied' });
        }
        const deadlineAt = normalizeFutureDeadline(req.body.deadlineAt);
        const ids = JSON.parse(req.body.targetClientIds || '[]');
        if (req.body.targetType !== 'all' && !ids.length) throw new Error('target_required');
        const folder = path.join(packagesPath, product.code);
        fs.mkdirSync(folder, { recursive: true });
        const version = String(req.body.version || '').trim(),
          safe = version.replace(/[^a-zA-Z0-9._-]/g, '');
        if (!safe) throw new Error('invalid_version');
        if (
          ciArtifact &&
          (ciArtifact.product_code !== product.code ||
            ciArtifact.version !== version ||
            !db
              .prepare('SELECT 1 FROM ci_artifact_channel WHERE artifact_id=? AND channel=?')
              .get(ciArtifact.id, req.body.channel))
        )
          throw new Error('artifact_metadata_mismatch');
        const name = `${safe}-${req.body.channel}${expectedExtension}`;
        final = path.join(folder, name);
        if (fs.existsSync(final)) throw new Error('release_file_already_exists');
        ownsFinal = true;
        const originalName =
          artifactType === 'sql' && sqlContent ? name : ciArtifact?.original_name || file.originalname;
        db.exec('BEGIN IMMEDIATE');
        inTransaction = true;
        const result = db
          .prepare(
            'INSERT INTO release(product_id,version,channel,file_path,sha256,size_bytes,mandatory,minimum_version,notes,technical_notes,show_notes_pdv,artifact_type,original_name,deadline_at,published_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
          )
          .run(
            product.id,
            version,
            req.body.channel,
            `${product.code}/${name}`,
            'pending',
            0,
            req.body.mandatory === 'true' ? 1 : 0,
            req.body.minimumVersion || null,
            req.body.notes || null,
            req.body.technicalNotes || null,
            req.body.showNotesPdv === 'true' ? 1 : 0,
            artifactType,
            originalName,
            deadlineAt,
            req.user.id
          );
        const releaseId = result.lastInsertRowid;
        db.prepare('UPDATE release SET rollout_percent=? WHERE id=?').run(
          normalizeRolloutPercent(req.body.rolloutPercent),
          releaseId
        );
        if (artifactType === 'package') {
          const source = ciArtifact ? path.resolve(packagesPath, ciArtifact.file_path) : file.path;
          if (!source.startsWith(packagesPath + path.sep) || !fs.existsSync(source))
            throw new Error('artifact_file_not_found');
          const manifest = addGeneratedManifest(source, final, {
            releaseId,
            product: product.code,
            channel: req.body.channel,
            version
          });
          db.prepare('UPDATE release SET executable_sha256=? WHERE id=?').run(manifest.executableSha256, releaseId);
        } else if (sqlContent) fs.writeFileSync(final, sqlContent + '\n', 'utf8');
        else fs.renameSync(file.path, final);
        const size = fs.statSync(final).size,
          sha = hashFileSync(final);
        db.prepare('UPDATE release SET sha256=?,size_bytes=? WHERE id=?').run(sha, size, releaseId);
        if (req.body.targetType === 'all')
          db.prepare("INSERT INTO release_target(release_id,target_type) VALUES(?,'all')").run(releaseId);
        else
          for (const id of ids)
            db.prepare("INSERT INTO release_target(release_id,target_type,client_id) VALUES(?,'client',?)").run(
              releaseId,
              id
            );
        db.prepare('INSERT INTO terminal_event(release_id,status,message,ip) VALUES(?,?,?,?)').run(
          releaseId,
          'published',
          `Versão ${version} publicada como ${artifactType === 'sql' ? 'script SQL' : 'pacote de arquivos com manifesto gerado pelo servidor'}, com prazo até ${deadlineAt}.`,
          req.ip
        );
        releaseSigner.signStoredRelease(releaseId);
        db.exec('COMMIT');
        inTransaction = false;
        if (ciArtifact)
          db.prepare('UPDATE ci_artifact SET consumed_at=CURRENT_TIMESTAMP,release_id=? WHERE id=?').run(
            releaseId,
            ciArtifact.id
          );
        if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        res.status(201).json({
          id: releaseId,
          sha256: sha,
          artifactType,
          fileName: originalName,
          manifestGenerated: artifactType === 'package'
        });
      } catch (e) {
        if (inTransaction) db.exec('ROLLBACK');
        if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        if (ownsFinal && final && fs.existsSync(final)) fs.unlinkSync(final);
        next(e);
      }
    }
  );
  app.patch('/api/v1/admin/releases/:id', adminAuth, (req, res) => {
    const release = db.prepare('SELECT * FROM release WHERE id=?').get(req.params.id);
    if (!release) return res.status(404).json({ error: 'release_not_found' });
    if (!canAccess(req.scopes, release.product_id, release.channel))
      return res.status(403).json({ error: 'scope_denied' });
    const active = req.body.active === undefined ? release.active : req.body.active ? 1 : 0,
      blocked = req.body.blocked === undefined ? release.blocked : req.body.blocked ? 1 : 0;
    let rolloutPercent;
    try {
      rolloutPercent = normalizeRolloutPercent(req.body.rolloutPercent, release.rollout_percent);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    db.prepare('UPDATE release SET active=?,blocked=?,rollout_percent=? WHERE id=?').run(
      active,
      blocked,
      rolloutPercent,
      release.id
    );
    res.json({ updated: true, active: Boolean(active), blocked: Boolean(blocked), rolloutPercent });
  });
  app.delete('/api/v1/admin/releases/:id', adminAuth, (req, res) => {
    const release = db
      .prepare(
        `SELECT r.*,p.code product_code FROM release r JOIN product p ON p.id=r.product_id WHERE r.id=? AND r.deleted_at IS NULL`
      )
      .get(req.params.id);
    if (!release) return res.status(404).json({ error: 'release_not_found' });
    if (!canAccess(req.scopes, release.product_id, release.channel))
      return res.status(403).json({ error: 'scope_denied' });
    const installations = db
      .prepare('SELECT count(*) value FROM terminal WHERE product_code=? AND channel=? AND current_version=?')
      .get(release.product_code, release.channel, release.version).value;
    if (installations) return res.status(409).json({ error: 'release_installed', installations });
    softDeleteRelease(db, release, packagesPath, req.user.id);
    res.json({ deleted: true });
  });
  app.get('/api/v1/admin/releases/:id/delete-impact', adminAuth, (req, res) => {
    const release = db
      .prepare(`SELECT r.*,p.code product_code FROM release r JOIN product p ON p.id=r.product_id WHERE r.id=?`)
      .get(req.params.id);
    if (!release) return res.status(404).json({ error: 'release_not_found' });
    if (!canAccess(req.scopes, release.product_id, release.channel))
      return res.status(403).json({ error: 'scope_denied' });
    const installations = db
        .prepare('SELECT count(*) value FROM terminal WHERE product_code=? AND current_version=?')
        .get(release.product_code, release.version).value,
      events = db.prepare('SELECT count(*) value FROM terminal_event WHERE release_id=?').get(release.id).value,
      sharedArtifact = db
        .prepare('SELECT count(*) value FROM release WHERE file_path=? AND id<>?')
        .get(release.file_path, release.id).value;
    res.json({ canDelete: installations === 0, installations, events, sharedArtifact: Boolean(sharedArtifact) });
  });
  app.post('/api/v1/admin/releases/:id/copy', adminAuth, (req, res, next) => {
    const source = db
      .prepare('SELECT r.*,p.code product_code FROM release r JOIN product p ON p.id=r.product_id WHERE r.id=?')
      .get(req.params.id);
    if (!source) return res.status(404).json({ error: 'release_not_found' });
    const channel = req.body.channel;
    if (!CHANNELS.includes(channel)) return res.status(400).json({ error: 'invalid_channel' });
    if (!canAccess(req.scopes, source.product_id, source.channel) || !canAccess(req.scopes, source.product_id, channel))
      return res.status(403).json({ error: 'scope_denied' });
    const ids = (req.body.targetClientIds || []).map(Number),
      targetType = req.body.targetType === 'client' ? 'client' : 'all';
    if (targetType === 'client' && !ids.length) return res.status(400).json({ error: 'target_required' });
    const version = String(req.body.version || source.version).trim(),
      safe = version.replace(/[^a-zA-Z0-9._-]/g, '');
    if (!safe) return res.status(400).json({ error: 'invalid_version' });
    const packageArtifact = source.artifact_type === 'package',
      name = `${safe}-${channel}${packageArtifact ? '.zip' : '.sql'}`,
      relativePath = packageArtifact ? `${source.product_code}/${name}` : source.file_path;
    const sourceFile = path.resolve(packagesPath, source.file_path),
      final = path.resolve(packagesPath, relativePath);
    let ownsFinal = false,
      inTransaction = false;
    try {
      if (!sourceFile.startsWith(packagesPath + path.sep) || !fs.existsSync(sourceFile))
        throw new Error('release_file_not_found');
      if (packageArtifact && fs.existsSync(final)) throw new Error('release_file_already_exists');
      if (packageArtifact) ownsFinal = true;
      const deadlineAt = normalizeFutureDeadline(req.body.deadlineAt);
      db.exec('BEGIN IMMEDIATE');
      inTransaction = true;
      const result = db
        .prepare(
          `INSERT INTO release(product_id,version,channel,file_path,sha256,size_bytes,mandatory,minimum_version,notes,technical_notes,show_notes_pdv,artifact_type,original_name,deadline_at,published_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(
          source.product_id,
          version,
          channel,
          relativePath,
          packageArtifact ? 'pending' : source.sha256,
          packageArtifact ? 0 : source.size_bytes,
          req.body.mandatory ? 1 : 0,
          req.body.minimumVersion || source.minimum_version,
          req.body.notes ?? source.notes,
          req.body.technicalNotes ?? source.technical_notes,
          req.body.showNotesPdv === undefined ? source.show_notes_pdv : req.body.showNotesPdv ? 1 : 0,
          source.artifact_type,
          source.original_name,
          deadlineAt,
          req.user.id
        );
      const id = result.lastInsertRowid;
      db.prepare('UPDATE release SET rollout_percent=? WHERE id=?').run(
        normalizeRolloutPercent(req.body.rolloutPercent),
        id
      );
      if (packageArtifact) {
        const manifest = addGeneratedManifest(sourceFile, final, {
          releaseId: id,
          product: source.product_code,
          channel,
          version
        });
        db.prepare('UPDATE release SET sha256=?,size_bytes=?,executable_sha256=? WHERE id=?').run(
          hashFileSync(final),
          fs.statSync(final).size,
          manifest.executableSha256,
          id
        );
      }
      if (targetType === 'all')
        db.prepare("INSERT INTO release_target(release_id,target_type) VALUES(?,'all')").run(id);
      else
        for (const clientId of ids)
          db.prepare("INSERT INTO release_target(release_id,target_type,client_id) VALUES(?,'client',?)").run(
            id,
            clientId
          );
      releaseSigner.signStoredRelease(id);
      db.exec('COMMIT');
      inTransaction = false;
      res.status(201).json({ id });
    } catch (e) {
      if (inTransaction) db.exec('ROLLBACK');
      if (ownsFinal && fs.existsSync(final)) fs.unlinkSync(final);
      next(e);
    }
  });
}
