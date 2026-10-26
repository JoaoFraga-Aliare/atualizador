import fs from 'node:fs';
import path from 'node:path';
import { compareVersions } from './version.js';

const successful = ['installed', 'updated', 'success'];
const marks = values => values.map(() => '?').join(',') || 'NULL';
const localDay = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.APP_TIME_ZONE || 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

function scopedReleases(db, req) {
  const args = [],
    where = ['r.deleted_at IS NULL', 'r.active=1'];
  if (!req.scopes.all) {
    where.push(`r.product_id IN (${marks(req.scopes.productIds)})`, `r.channel IN (${marks(req.scopes.channels)})`);
    args.push(...req.scopes.productIds, ...req.scopes.channels);
  }
  return db
    .prepare(
      `SELECT r.*,p.code product_code,p.name product_name,u.name published_by_name FROM release r JOIN product p ON p.id=r.product_id LEFT JOIN app_user u ON u.id=r.published_by WHERE ${where.join(' AND ')}`
    )
    .all(...args);
}

function existingSize(packagesPath, relative) {
  if (!relative) return 0;
  const file = path.resolve(packagesPath, relative);
  return file.startsWith(packagesPath + path.sep) && fs.existsSync(file) ? fs.statSync(file).size : 0;
}

export function cleanupCandidates(db, req, packagesPath) {
  const releases = scopedReleases(db, req),
    groups = new Map();
  for (const release of releases) {
    const key = `${release.product_id}:${release.channel}`,
      list = groups.get(key) || [];
    list.push(release);
    groups.set(key, list);
  }
  const candidates = [];
  for (const list of groups.values()) {
    const sample = list[0],
      versions = db
        .prepare(
          "SELECT DISTINCT current_version FROM terminal WHERE product_code=? AND channel=? AND trim(current_version)<>''"
        )
        .all(sample.product_code, sample.channel)
        .map(x => x.current_version);
    if (!versions.length) continue;
    const latest = versions.sort(compareVersions).at(-1);
    for (const release of list) {
      if (compareVersions(release.version, latest) >= 0) continue;
      const terminals = db
        .prepare('SELECT count(*) value FROM terminal WHERE product_code=? AND channel=? AND current_version=?')
        .get(release.product_code, release.channel, release.version).value;
      if (terminals) continue;
      const last = db
          .prepare(
            `SELECT max(created_at) value FROM terminal_event WHERE release_id=? AND status IN (${successful.map(() => '?').join(',')})`
          )
          .get(release.id, ...successful).value,
        artifact = db.prepare('SELECT file_path FROM ci_artifact WHERE release_id=?').get(release.id),
        reclaimBytes = existingSize(packagesPath, release.file_path) + existingSize(packagesPath, artifact?.file_path);
      candidates.push({ ...release, latest_version: latest, last_update_at: last, reclaim_bytes: reclaimBytes });
    }
  }
  return candidates.sort(
    (a, b) =>
      a.product_name.localeCompare(b.product_name, 'pt-BR') ||
      a.channel.localeCompare(b.channel) ||
      compareVersions(a.version, b.version)
  );
}

export function softDeleteRelease(db, release, packagesPath, userId) {
  const remove = relative => {
    if (!relative) return;
    const file = path.resolve(packagesPath, relative);
    if (file.startsWith(packagesPath + path.sep) && fs.existsSync(file)) fs.unlinkSync(file);
  };
  const artifacts = db.prepare('SELECT file_path FROM ci_artifact WHERE release_id=?').all(release.id);
  db.transaction(() => {
    db.prepare('UPDATE release SET active=0,blocked=1,deleted_at=CURRENT_TIMESTAMP,deleted_by=? WHERE id=?').run(
      userId,
      release.id
    );
    db.prepare('INSERT INTO terminal_event(release_id,status,message) VALUES(?,?,?)').run(
      release.id,
      'deleted',
      'Versão excluída e arquivo removido para liberação de espaço.'
    );
  })();
  remove(release.file_path);
  for (const artifact of artifacts) remove(artifact.file_path);
}

export function releaseAnalytics(db, release, decryptStoredError, errorSignature) {
  const installed = db
      .prepare(
        `SELECT count(DISTINCT terminal_id) value,min(created_at) first_at,max(created_at) last_at FROM terminal_event WHERE release_id=? AND terminal_id IS NOT NULL AND status IN (${successful.map(() => '?').join(',')})`
      )
      .get(release.id, ...successful),
    errors = db
      .prepare(
        'SELECT * FROM application_error WHERE detected_release_id=? AND encrypted_payload IS NOT NULL ORDER BY received_at'
      )
      .all(release.id),
    errorTerminals = new Set(),
    top = new Map(),
    errorDays = new Map();
  for (const row of errors) {
    let decrypted;
    try {
      decrypted = decryptStoredError(row);
      const payload = decrypted.payload,
        exception = String(payload.exceptionClass || payload.exception || 'Erro'),
        message = String(payload.message || ''),
        signature = errorSignature(exception, message),
        current = top.get(signature) || { exception, message, count: 0, lastAt: null };
      current.count++;
      current.lastAt = row.received_at;
      top.set(signature, current);
      if (row.terminal_id) errorTerminals.add(row.terminal_id);
      const day = row.received_at.slice(0, 10);
      errorDays.set(day, (errorDays.get(day) || 0) + 1);
    } catch {
    } finally {
      if (decrypted) {
        decrypted.plain.fill(0);
        decrypted.key.fill(0);
      }
    }
  }
  const installDays = db
      .prepare(
        `SELECT date(created_at,'localtime') day,count(DISTINCT terminal_id) terminals FROM terminal_event WHERE release_id=? AND terminal_id IS NOT NULL AND status IN (${successful.map(() => '?').join(',')}) GROUP BY date(created_at,'localtime')`
      )
      .all(release.id, ...successful),
    days = new Map(installDays.map(x => [x.day, { date: x.day, terminals: x.terminals, errors: 0 }]));
  for (const [date, count] of errorDays) {
    const day = days.get(date) || { date, terminals: 0, errors: 0 };
    day.errors = count;
    days.set(date, day);
  }
  const end = release.deleted_at ? new Date(release.deleted_at.replace(' ', 'T') + 'Z') : new Date(),
    start = new Date(release.published_at.replace(' ', 'T') + 'Z'),
    activeDays = Math.max(1, Math.ceil((end - start) / 86400000));
  return {
    activeDays,
    terminals: installed.value || 0,
    terminalsWithErrors: errorTerminals.size,
    errorTerminalPercent: installed.value ? Number(((errorTerminals.size * 100) / installed.value).toFixed(2)) : 0,
    firstInstallationAt: installed.first_at,
    lastInstallationAt: installed.last_at,
    topErrors: [...top.values()].sort((a, b) => b.count - a.count).slice(0, 5),
    timeline: [...days.values()].sort((a, b) => a.date.localeCompare(b.date))
  };
}

export function registerReleaseCleanupRoutes(app, { db, adminAuth, packagesPath }) {
  app.get('/api/v1/admin/release-cleanup', adminAuth, (req, res) => {
    const candidates = cleanupCandidates(db, req, packagesPath),
      sizeBytes = candidates.reduce((sum, x) => sum + x.reclaim_bytes, 0),
      date = localDay();
    res.json({ key: `release_cleanup:${date}`, date, count: candidates.length, sizeBytes, candidates });
  });
  app.post('/api/v1/admin/release-cleanup/delete', adminAuth, (req, res, next) => {
    try {
      const selected = new Set((req.body.ids || []).map(Number)),
        allowed = new Map(cleanupCandidates(db, req, packagesPath).map(x => [x.id, x])),
        items = [...selected].map(id => allowed.get(id));
      if (!items.length || items.some(x => !x)) throw new Error('invalid_cleanup_selection');
      for (const release of items) softDeleteRelease(db, release, packagesPath, req.user.id);
      res.json({ deleted: items.length, reclaimedBytes: items.reduce((sum, x) => sum + x.reclaim_bytes, 0) });
    } catch (e) {
      next(e);
    }
  });
}
