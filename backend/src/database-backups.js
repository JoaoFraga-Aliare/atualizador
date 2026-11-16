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
  async function databaseSetting() {
    const setting = await db
      .prepare(
        'SELECT retention_days retentionDays,retention_count retentionCount FROM terminal_database_setting WHERE id=1'
      )
      .get();
    return { retentionDays: setting?.retentionDays ?? 30, retentionCount: setting?.retentionCount ?? 5 };
  }
  async function refreshLastDatabaseUpload(terminalId) {
    const last = await db
      .prepare('SELECT id FROM terminal_database_upload WHERE terminal_id=? ORDER BY received_at DESC,id DESC LIMIT 1')
      .get(terminalId);
    await db
      .prepare('UPDATE terminal_database_request SET last_upload_id=?,updated_at=now() WHERE terminal_id=?')
      .run(last?.id || null, terminalId);
  }
  function databaseBackupFile(upload) {
    const file = path.resolve(databaseBackupsPath, String(upload.file_path || ''));
    return file.startsWith(databaseBackupsPath + path.sep) ? file : null;
  }
  async function migrateLegacyDatabaseBackups() {
    const legacyRoot = path.join(packagesPath, 'bancos');
    for (const row of await db
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
        await db.prepare('UPDATE terminal_database_upload SET file_path=? WHERE id=?').run(relativePath, row.id);
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
  async function removeDatabaseUpload(upload) {
    const file = databaseBackupFile(upload);
    if (file && fs.existsSync(file)) fs.unlinkSync(file);
    await db.prepare('DELETE FROM terminal_database_upload WHERE id=?').run(upload.id);
    await refreshLastDatabaseUpload(upload.terminal_id);
  }
  async function pruneDatabaseUploads(terminalId) {
    const setting = await databaseSetting(),
      args = [terminalId],
      where = ['terminal_id=?'];
    if (setting.retentionDays > 0) {
      where.push(`received_at < now() - (?::int * interval '1 day')`);
      args.push(setting.retentionDays);
    }
    let rows =
      setting.retentionDays > 0
        ? await db.prepare(`SELECT * FROM terminal_database_upload WHERE ${where.join(' AND ')}`).all(...args)
        : [];
    if (setting.retentionCount > 0)
      rows.push(
        ...(await db
          .prepare(
            `SELECT * FROM terminal_database_upload WHERE terminal_id=? AND id NOT IN (SELECT id FROM terminal_database_upload WHERE terminal_id=? ORDER BY received_at DESC,id DESC LIMIT ?)`
          )
          .all(terminalId, terminalId, setting.retentionCount))
      );
    const seen = new Set();
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      await removeDatabaseUpload(row);
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
