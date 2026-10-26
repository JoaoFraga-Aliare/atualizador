import fs from 'node:fs';
import path from 'node:path';
import { moveFile, listFiles } from './lib/util.js';

// Backups de banco enviados pelos terminais (fora da pasta publica /downloads).
export function createDatabaseBackups({ db, packagesPath, databaseBackupsPath }) {
  function databaseUploadDto(row) {
    return row
      ? {
          id: row.id,
          terminalId: row.terminal_id,
          terminalName: row.terminal_name,
          computerName: row.computer_name,
          originalName: row.original_name,
          sha256: row.sha256,
          sizeBytes: row.size_bytes,
          receivedAt: row.received_at,
          ip: row.ip
        }
      : null;
  }
  function databaseSetting() {
    const setting = db
      .prepare(
        'SELECT retention_days retentionDays,retention_count retentionCount FROM terminal_database_setting WHERE id=1'
      )
      .get();
    return { retentionDays: setting?.retentionDays ?? 30, retentionCount: setting?.retentionCount ?? 5 };
  }
  function refreshLastDatabaseUpload(terminalId) {
    const last = db
      .prepare('SELECT id FROM terminal_database_upload WHERE terminal_id=? ORDER BY received_at DESC,id DESC LIMIT 1')
      .get(terminalId);
    db.prepare(
      'UPDATE terminal_database_request SET last_upload_id=?,updated_at=CURRENT_TIMESTAMP WHERE terminal_id=?'
    ).run(last?.id || null, terminalId);
  }
  function databaseBackupFile(upload) {
    const file = path.resolve(databaseBackupsPath, String(upload.file_path || ''));
    return file.startsWith(databaseBackupsPath + path.sep) ? file : null;
  }
  function migrateLegacyDatabaseBackups() {
    const legacyRoot = path.join(packagesPath, 'bancos');
    for (const row of db
      .prepare("SELECT id,file_path FROM terminal_database_upload WHERE file_path LIKE 'bancos/%'")
      .all()) {
      const relativePath = row.file_path.slice('bancos/'.length),
        source = path.resolve(packagesPath, row.file_path),
        target = path.resolve(databaseBackupsPath, relativePath);
      if (!source.startsWith(legacyRoot + path.sep) || !target.startsWith(databaseBackupsPath + path.sep)) continue;
      try {
        if (fs.existsSync(source)) {
          fs.mkdirSync(path.dirname(target), { recursive: true });
          moveFile(source, target);
        }
        db.prepare('UPDATE terminal_database_upload SET file_path=? WHERE id=?').run(relativePath, row.id);
      } catch (error) {
        console.error(`Falha ao migrar o backup de banco ${row.id}: ${error.message}`);
      }
    }
    if (!fs.existsSync(legacyRoot)) return;
    // Arquivos sem registro tambem saem da pasta publica.
    for (const source of listFiles(legacyRoot)) {
      const target = path.join(databaseBackupsPath, 'sem-registro', path.relative(legacyRoot, source));
      try {
        if (fs.existsSync(target)) continue;
        fs.mkdirSync(path.dirname(target), { recursive: true });
        moveFile(source, target);
      } catch (error) {
        console.error(`Falha ao mover ${source}: ${error.message}`);
      }
    }
    if (!listFiles(legacyRoot).length) fs.rmSync(legacyRoot, { recursive: true, force: true });
    else console.error(`Ainda ha arquivos em ${legacyRoot}; remova-os manualmente.`);
  }
  function removeDatabaseUpload(upload) {
    const file = databaseBackupFile(upload);
    if (file && fs.existsSync(file)) fs.unlinkSync(file);
    db.prepare('DELETE FROM terminal_database_upload WHERE id=?').run(upload.id);
    refreshLastDatabaseUpload(upload.terminal_id);
  }
  function pruneDatabaseUploads(terminalId) {
    const setting = databaseSetting(),
      args = [terminalId],
      where = ['terminal_id=?'];
    if (setting.retentionDays > 0) {
      where.push(`received_at < datetime('now',?)`);
      args.push(`-${setting.retentionDays} days`);
    }
    let rows =
      setting.retentionDays > 0
        ? db.prepare(`SELECT * FROM terminal_database_upload WHERE ${where.join(' AND ')}`).all(...args)
        : [];
    if (setting.retentionCount > 0)
      rows.push(
        ...db
          .prepare(
            `SELECT * FROM terminal_database_upload WHERE terminal_id=? AND id NOT IN (SELECT id FROM terminal_database_upload WHERE terminal_id=? ORDER BY received_at DESC,id DESC LIMIT ?)`
          )
          .all(terminalId, terminalId, setting.retentionCount)
      );
    const seen = new Set();
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      removeDatabaseUpload(row);
    }
  }
  return {
    databaseUploadDto,
    databaseSetting,
    refreshLastDatabaseUpload,
    databaseBackupFile,
    migrateLegacyDatabaseBackups,
    removeDatabaseUpload,
    pruneDatabaseUploads
  };
}
