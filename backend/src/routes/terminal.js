import fs from 'node:fs';
import path from 'node:path';
import { compareVersions } from '../version.js';
import { getReleasePolicy, inRollout } from '../release.js';
import { CHANNELS } from '../auth.js';
import { SIGNATURE_ALGORITHM, SIGNED_PAYLOAD_FORMAT } from '../release-signature.js';
import { hashFileSync, textValue, safeZipName, moveFile } from '../lib/util.js';
import {
  normalizeScreenshot,
  normalizeKeyTerminalId,
  decryptEnvelope,
  encryptErrorPayload
} from '../lib/error-crypto.js';
import { bearerToken } from '../terminal-keys.js';

// Rotas usadas pelos terminais (chave de instalacao) e status publico.
export function registerTerminalRoutes(app, ctx) {
  const {
    terminalKeys,
    db,
    databaseBackupsPath,
    packagesPath,
    downloadBase,
    upload,
    signingKey,
    installationAuth,
    saveLiveEvent,
    pruneDatabaseUploads
  } = ctx;
  function registerInstallation(body) {
    const { client, terminal, product = 'pdv', channel = 'production', currentVersion = '0.0.0' } = body;
    if (!client?.id || !client?.name || !terminal?.id || !terminal?.name) throw new Error('invalid_installation');
    db.prepare(
      `INSERT INTO client(external_id,name,document) VALUES(?,?,?) ON CONFLICT(external_id) DO UPDATE SET name=excluded.name,document=excluded.document,last_seen_at=CURRENT_TIMESTAMP`
    ).run(client.id, client.name, client.document || null);
    const c = db.prepare('SELECT id FROM client WHERE external_id=?').get(client.id);
    db.prepare(
      `INSERT INTO terminal(external_id,client_id,name,computer_name,product_code,channel,current_version,os_version) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(external_id) DO UPDATE SET client_id=excluded.client_id,name=excluded.name,computer_name=excluded.computer_name,product_code=excluded.product_code,channel=excluded.channel,current_version=excluded.current_version,os_version=excluded.os_version,last_seen_at=CURRENT_TIMESTAMP`
    ).run(
      terminal.id,
      c.id,
      terminal.name,
      terminal.computerName || null,
      product,
      channel,
      currentVersion,
      terminal.osVersion || null
    );
    return { client: c, terminal: db.prepare('SELECT * FROM terminal WHERE external_id=?').get(terminal.id) };
  }
  // 503 quando o banco nao responde ou falta espaco para pacotes e backups (HEALTH_MIN_FREE_MB).
  app.get('/health', (_q, res) => {
    const minFree = Number(process.env.HEALTH_MIN_FREE_MB ?? 1024) * 1024 * 1024,
      checks = {};
    try {
      db.prepare('SELECT 1').get();
      checks.database = 'ok';
    } catch (e) {
      checks.database = e.message;
    }
    for (const [name, folder] of Object.entries({ packages: packagesPath, databaseBackups: databaseBackupsPath })) {
      try {
        const stats = fs.statfsSync(folder),
          freeBytes = stats.bavail * stats.bsize;
        checks[name] = { freeBytes, ok: freeBytes >= minFree };
      } catch (e) {
        checks[name] = { error: e.message, ok: false };
      }
    }
    const ok = checks.database === 'ok' && checks.packages.ok && checks.databaseBackups.ok;
    res.status(ok ? 200 : 503).json({ ok, checks });
  });
  app.get('/api/v1/packages/signing-key', (_q, res) =>
    res.json({
      algorithm: SIGNATURE_ALGORITHM,
      payloadFormat: SIGNED_PAYLOAD_FORMAT,
      keyId: signingKey.keyId,
      publicKey: signingKey.publicKeyBase64,
      publicKeyPem: signingKey.publicKeyPem
    })
  );
  app.post('/api/v1/versions/resolve-hash', installationAuth, (req, res) => {
    const executableHash = textValue(req.body?.executableHash)?.toLowerCase(),
      product = textValue(req.body?.product) || 'pdv',
      channel = textValue(req.body?.channel);
    if (!executableHash || !/^[a-f0-9]{64}$/.test(executableHash))
      return res.status(400).json({ error: 'invalid_executable_sha256' });
    if (channel && !CHANNELS.includes(channel)) return res.status(400).json({ error: 'invalid_channel' });
    const args = [product, executableHash],
      channelFilter = channel ? 'AND r.channel=?' : '';
    if (channel) args.push(channel);
    const release = db
      .prepare(
        `SELECT r.id,r.version,r.channel,r.technical_notes,r.published_at,p.code product FROM release r JOIN product p ON p.id=r.product_id WHERE p.code=? AND lower(r.executable_sha256)=? ${channelFilter} ORDER BY r.published_at DESC,r.id DESC LIMIT 1`
      )
      .get(...args);
    if (!release) return res.status(404).json({ error: 'executable_hash_not_homologated' });
    res.json({
      homologated: true,
      releaseId: String(release.id),
      product: release.product,
      channel: release.channel,
      version: release.version,
      technicalNotes: release.technical_notes || null,
      publishedAt: release.published_at
    });
  });
  app.post('/api/v1/updates/check', installationAuth, (req, res) => {
    try {
      const reg = registerInstallation(req.body),
        terminalKey = req.installation?.type === 'global' ? terminalKeys.issueKey(reg.terminal.id) : null,
        { product = 'pdv', channel = 'production', currentVersion = '0.0.0' } = req.body,
        currentExecutableHash = textValue(req.body.currentExecutableHash)?.toLowerCase() || null;
      if (currentExecutableHash && !/^[a-f0-9]{64}$/.test(currentExecutableHash))
        throw new Error('invalid_current_executable_sha256');
      const releases = db
        .prepare(
          `SELECT DISTINCT r.* FROM release r JOIN product p ON p.id=r.product_id JOIN release_target rt ON rt.release_id=r.id WHERE p.code=? AND r.channel=? AND r.active=1 AND r.blocked=0 AND (rt.target_type='all' OR (rt.target_type='client' AND rt.client_id=?)) ORDER BY r.published_at DESC,r.id DESC`
        )
        .all(product, channel, reg.client.id)
        .filter(r => inRollout(r, reg.terminal.external_id));
      const currentRelease = currentExecutableHash
          ? db
              .prepare(
                `SELECT r.* FROM release r JOIN product p ON p.id=r.product_id WHERE p.code=? AND r.channel=? AND r.version=? AND lower(r.executable_sha256)=? ORDER BY r.published_at DESC,r.id DESC LIMIT 1`
              )
              .get(product, channel, currentVersion, currentExecutableHash)
          : null,
        release = currentExecutableHash
          ? currentRelease
            ? releases.find(
                r =>
                  r.published_at > currentRelease.published_at ||
                  (r.published_at === currentRelease.published_at && r.id > currentRelease.id)
              )
            : null
          : releases.find(r => compareVersions(r.version, currentVersion) > 0),
        currentAuthorized = !currentExecutableHash || Boolean(currentRelease),
        policy = getReleasePolicy(release),
        status = !currentAuthorized ? 'version_not_homologated' : release ? 'update_available' : 'no_update',
        message = !currentAuthorized
          ? 'A versão atual não corresponde ao hash de uma publicação homologada.'
          : release
            ? `Versão ${release.version} disponível (${release.artifact_type})${policy.deadlineExpired ? ' e obrigatória por prazo vencido' : ''}.`
            : 'Terminal já está atualizado.';
      db.prepare(
        'INSERT INTO terminal_event(terminal_id,release_id,previous_version,target_version,status,message,ip) VALUES(?,?,?,?,?,?,?)'
      ).run(reg.terminal.id, release?.id || null, currentVersion, release?.version || null, status, message, req.ip);
      // terminalKey so aparece enquanto o terminal nao confirmou a chave; deve ser guardada e usada no lugar da global.
      const keyField = terminalKey ? { terminalKey } : {};
      if (!release) return res.json({ available: false, currentVersion, currentAuthorized, message, ...keyField });
      res.json({
        ...keyField,
        available: true,
        currentAuthorized,
        releaseId: String(release.id),
        version: release.version,
        mandatory: policy.mandatory,
        mandatoryNow: policy.mandatory,
        mandatoryReason: policy.mandatoryReason,
        deadlineAt: release.deadline_at,
        deadlineExpired: policy.deadlineExpired,
        minimumVersion: release.minimum_version,
        artifactType: release.artifact_type || 'package',
        fileName: release.original_name || path.basename(release.file_path),
        downloadUrl: `${downloadBase}/${release.file_path}`,
        sha256: release.sha256,
        sizeBytes: release.size_bytes,
        signature: release.signature,
        signatureKeyId: release.signature_key_id,
        signatureAlgorithm: SIGNATURE_ALGORITHM,
        signedPayloadFormat: SIGNED_PAYLOAD_FORMAT,
        notes: release.show_notes_pdv ? release.technical_notes : null,
        showNotesPdv: Boolean(release.show_notes_pdv)
      });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.post('/api/v1/updates/events', installationAuth, (req, res) => {
    const body = req.body || {},
      status = textValue(body.status);
    if (typeof body.terminalId !== 'string' || !body.terminalId.trim())
      return res.status(400).json({ error: 'invalid_terminal_id' });
    if (!status || status.length > 40 || !/^[A-Za-z0-9_.-]+$/.test(status))
      return res.status(400).json({ error: 'invalid_status' });
    for (const field of ['previousVersion', 'targetVersion', 'product'])
      if (body[field] != null && (typeof body[field] !== 'string' || body[field].length > 50))
        return res.status(400).json({ error: `invalid_${field}` });
    if (body.message != null && typeof body.message !== 'string')
      return res.status(400).json({ error: 'invalid_message' });
    const t = db.prepare('SELECT id FROM terminal WHERE external_id=?').get(body.terminalId);
    if (!t) return res.status(404).json({ error: 'terminal_not_found' });
    const release = req.body.targetVersion
      ? db
          .prepare(
            `SELECT r.id FROM release r JOIN product p ON p.id=r.product_id WHERE r.version=? AND p.code=? ORDER BY r.id DESC LIMIT 1`
          )
          .get(req.body.targetVersion, req.body.product || 'pdv')
      : null;
    db.prepare(
      'INSERT INTO terminal_event(terminal_id,release_id,previous_version,target_version,status,message,ip) VALUES(?,?,?,?,?,?,?)'
    ).run(
      t.id,
      release?.id || null,
      body.previousVersion || null,
      body.targetVersion || null,
      status,
      textValue(body.message)?.slice(0, 4000) || null,
      req.ip
    );
    res.status(202).json({ accepted: true });
  });
  app.post('/api/v1/live/events', installationAuth, (req, res) => {
    try {
      const event = saveLiveEvent({
        terminalId: req.body.terminalId,
        type: req.body.type,
        name: req.body.name,
        operation: req.body.operation,
        value: req.body.value,
        ip: req.ip
      });
      res.status(202).json({ accepted: true, event });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.post('/api/v1/errors', installationAuth, (req, res) => {
    let decrypted;
    try {
      const body = req.body || {},
        terminalId = normalizeKeyTerminalId(body.terminalId);
      if (!terminalId) throw new Error('terminal_id_required');
      decrypted = decryptEnvelope(terminalId, body);
      const diagnostic = JSON.parse(decrypted.plain.toString('utf8')),
        exceptionClass = textValue(diagnostic.exceptionClass || diagnostic.exception),
        message = textValue(diagnostic.message);
      if (!exceptionClass) throw new Error('exception_required');
      if (!message) throw new Error('message_required');
      const terminal = db
          .prepare('SELECT id,product_code,channel FROM terminal WHERE lower(trim(external_id))=?')
          .get(terminalId),
        product = terminal?.product_code || textValue(body.product) || 'pdv',
        reportedHash =
          textValue(
            diagnostic.executableHash || diagnostic.executableSha256 || diagnostic.pdvHash || diagnostic.hash
          )?.toLowerCase() || null;
      if (reportedHash && !/^[a-f0-9]{64}$/.test(reportedHash)) throw new Error('invalid_executable_sha256');
      const detected = reportedHash
          ? db
              .prepare(
                `SELECT r.id,r.version,r.channel FROM release r JOIN product p ON p.id=r.product_id WHERE p.code=? AND lower(r.executable_sha256)=? ORDER BY (r.channel=?) DESC,r.published_at DESC,r.id DESC LIMIT 1`
              )
              .get(product, reportedHash, terminal?.channel || 'production')
          : null,
        declaredVersion = textValue(diagnostic.version),
        hashStatus = !reportedHash
          ? 'missing'
          : !detected
            ? 'unauthorized'
            : declaredVersion === detected.version
              ? 'authorized'
              : 'version_mismatch',
        setting = db.prepare('SELECT store_screenshot FROM error_setting WHERE id=1').get(),
        rawScreenshot = diagnostic.screenshotBase64 ?? diagnostic.base64 ?? diagnostic.print,
        screenshot = setting?.store_screenshot ? normalizeScreenshot(rawScreenshot) : null;
      if (reportedHash) {
        diagnostic.reportedVersion = declaredVersion;
        diagnostic.version = detected?.version || 'Não homologada';
        diagnostic.versionValidation = hashStatus;
      }
      if (screenshot) diagnostic.screenshotBase64 = `data:${screenshot.mime};base64,${screenshot.base64}`;
      else delete diagnostic.screenshotBase64;
      delete diagnostic.base64;
      delete diagnostic.print;
      const encrypted = encryptErrorPayload(terminalId, diagnostic),
        result = db
          .prepare(
            'INSERT INTO application_error(terminal_id,product_code,occurred_at,exception_class,message,screenshot_mime,ip,key_terminal_id,crypto_salt,crypto_iv,crypto_auth_tag,encrypted_payload,reported_executable_sha256,detected_release_id,executable_hash_status) VALUES(?,?,CURRENT_TIMESTAMP,?,?,?,?,?,?,?,?,?,?,?,?)'
          )
          .run(
            terminal?.id || null,
            product,
            '<encrypted>',
            '<encrypted>',
            screenshot?.mime || null,
            req.ip,
            terminalId,
            encrypted.salt,
            encrypted.iv,
            encrypted.authTag,
            encrypted.ciphertext,
            reportedHash,
            detected?.id || null,
            hashStatus
          );
      res.status(201).json({
        accepted: true,
        id: Number(result.lastInsertRowid),
        screenshotStored: Boolean(screenshot),
        executableHashStatus: hashStatus,
        reportedVersion: declaredVersion,
        detectedVersion: detected?.version || null,
        resolvedVersion: diagnostic.version || null
      });
    } catch (e) {
      res.status(400).json({ error: e.message });
    } finally {
      if (decrypted) {
        decrypted.plain.fill(0);
        decrypted.key.fill(0);
        decrypted.ciphertext.fill(0);
      }
    }
  });
  app.get('/api/v1/database/request', installationAuth, (req, res) => {
    const terminalId = normalizeKeyTerminalId(req.query.terminalId || req.query.terminal || req.query.id),
      terminal = terminalId
        ? db.prepare('SELECT id FROM terminal WHERE lower(trim(external_id))=?').get(terminalId)
        : null;
    if (!terminal) return res.status(404).json({ error: 'terminal_not_found' });
    let state = db
      .prepare('SELECT requested_at,last_upload_id FROM terminal_database_request WHERE terminal_id=?')
      .get(terminal.id);
    if (!state) {
      db.prepare('INSERT INTO terminal_database_request(terminal_id) VALUES(?)').run(terminal.id);
      state = db
        .prepare('SELECT requested_at,last_upload_id FROM terminal_database_request WHERE terminal_id=?')
        .get(terminal.id);
    }
    res.json({ requested: Boolean(state.requested_at), terminalId, lastUploadId: state.last_upload_id || null });
  });
  app.post('/api/v1/database/upload', installationAuth, upload.single('database'), (req, res, next) => {
    const file = req.file;
    let storedPath;
    try {
      const terminalId = normalizeKeyTerminalId(req.body.terminalId || req.query.terminalId),
        terminal = terminalId
          ? db.prepare('SELECT id FROM terminal WHERE lower(trim(external_id))=?').get(terminalId)
          : null;
      if (!terminal) throw new Error('terminal_not_found');
      const auth = terminalKeys.authenticate(bearerToken(req), terminalId);
      if (!auth.ok) {
        if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        return res.status(auth.status).json({ error: auth.error });
      }
      if (!file || path.extname(file.originalname).toLowerCase() !== '.zip') throw new Error('zip_required');
      const folder = path.join(databaseBackupsPath, String(terminal.id));
      fs.mkdirSync(folder, { recursive: true });
      const finalName = `${new Date().toISOString().replace(/[:.]/g, '-')}-${safeZipName(file.originalname)}`;
      storedPath = path.join(folder, finalName);
      moveFile(file.path, storedPath);
      const sha256 = hashFileSync(storedPath),
        sizeBytes = fs.statSync(storedPath).size,
        relativePath = path.relative(databaseBackupsPath, storedPath).replace(/\\/g, '/'),
        uploadId = db.transaction(() => {
          const result = db
            .prepare(
              'INSERT INTO terminal_database_upload(terminal_id,file_path,original_name,sha256,size_bytes,ip) VALUES(?,?,?,?,?,?)'
            )
            .run(terminal.id, relativePath, file.originalname, sha256, sizeBytes, req.ip);
          db.prepare(
            `INSERT INTO terminal_database_request(terminal_id,requested_at,last_upload_id,updated_at) VALUES(?,NULL,?,CURRENT_TIMESTAMP) ON CONFLICT(terminal_id) DO UPDATE SET requested_at=NULL,last_upload_id=excluded.last_upload_id,updated_at=CURRENT_TIMESTAMP`
          ).run(terminal.id, result.lastInsertRowid);
          return result.lastInsertRowid;
        })();
      pruneDatabaseUploads(terminal.id);
      res.status(201).json({ accepted: true, id: Number(uploadId), sha256, sizeBytes });
    } catch (e) {
      if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
      if (storedPath && fs.existsSync(storedPath)) fs.unlinkSync(storedPath);
      next(e);
    }
  });
}
