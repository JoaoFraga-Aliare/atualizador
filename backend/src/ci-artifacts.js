import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { unzipSync, zipSync } from 'fflate';

const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');

function safeName(value) {
  const name = String(value || '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '');
  const parts = name.split('/');
  if (
    !name ||
    name.includes('\0') ||
    name.startsWith('/') ||
    /^[a-z]:/i.test(name) ||
    parts.some(part => !part || part === '.' || part === '..')
  )
    throw new Error('zip_unsafe_path');
  return parts.join('/');
}

export function readArtifactZip(file) {
  let archive,
    total = 0;
  try {
    archive = unzipSync(fs.readFileSync(file), {
      filter: entry => {
        if (entry.name.endsWith('/')) return false;
        total += entry.originalSize;
        if (total > 1024 * 1024 * 1024) throw new Error('zip_uncompressed_too_large');
        return true;
      }
    });
  } catch (error) {
    if (error.message === 'zip_uncompressed_too_large' || error.message === 'zip_unsafe_path') throw error;
    throw new Error('invalid_zip');
  }
  const result = new Map();
  for (const [raw, data] of Object.entries(archive)) {
    const name = safeName(raw);
    if (name.toLowerCase() === 'manifest.json') continue;
    const key = name.toLocaleLowerCase('en-US');
    if (result.has(key)) throw new Error('zip_duplicate_path');
    result.set(key, { name, data, sha256: sha256(data), sizeBytes: data.length });
  }
  if (!result.size) throw new Error('zip_has_no_files');
  return result;
}

const artifactSelect = `SELECT a.*,p.id product_id,p.name product_name,u.name user_name,u.username,
  COALESCE((SELECT group_concat(ac.channel) FROM ci_artifact_channel ac WHERE ac.artifact_id=a.id),a.channel) allowed_channels,
  CASE WHEN a.consumed_at IS NULL THEN 'pending' ELSE 'released' END status
  FROM ci_artifact a LEFT JOIN product p ON p.code=a.product_code LEFT JOIN app_user u ON u.id=a.user_id`;

function visibleArtifact(db, req, id, { pending = false } = {}) {
  const artifact = db
    .prepare(
      `${artifactSelect} WHERE a.id=? ${req.user.role === 'admin' ? '' : 'AND a.user_id=?'} ${pending ? 'AND a.consumed_at IS NULL' : ''}`
    )
    .get(id, ...(req.user.role === 'admin' ? [] : [req.user.id]));
  if (!artifact) throw new Error('artifact_not_found');
  return artifact;
}

function artifactFile(packagesPath, artifact) {
  const file = path.resolve(packagesPath, artifact.file_path);
  if (!file.startsWith(packagesPath + path.sep) || !fs.existsSync(file)) throw new Error('artifact_file_not_found');
  return file;
}

export function mergeAnalysis(packagesPath, artifacts) {
  if (artifacts.some(item => item.product_code !== artifacts[0].product_code))
    throw new Error('artifact_merge_metadata_mismatch');
  const byPath = new Map();
  for (const artifact of artifacts)
    for (const [key, file] of readArtifactZip(artifactFile(packagesPath, artifact))) {
      const list = byPath.get(key) || [];
      list.push({ ...file, artifactId: artifact.id, version: artifact.version, userName: artifact.user_name });
      byPath.set(key, list);
    }
  const conflicts = [],
    selected = new Map();
  for (const [key, options] of byPath) {
    const unique = new Set(options.map(x => x.sha256));
    if (unique.size === 1) selected.set(key, options.at(-1));
    else conflicts.push({ path: options[0].name, options: options.map(({ data, ...item }) => item) });
  }
  const channelSets = artifacts.map(
      item =>
        new Set(
          String(item.allowed_channels || item.channel)
            .split(',')
            .filter(Boolean)
        )
    ),
    allowedChannels = [...channelSets[0]].filter(channel => channelSets.every(set => set.has(channel)));
  if (!allowedChannels.length) throw new Error('artifact_merge_no_common_channel');
  return { byPath, selected, conflicts, allowedChannels };
}

export function registerCiArtifactRoutes(app, { db, adminAuth, packagesPath, incomingPath, hashFileSync }) {
  app.get('/api/v1/admin/artifacts', adminAuth, (req, res) => {
    const where =
      req.user.role === 'admin' ? 'WHERE a.consumed_at IS NULL' : 'WHERE a.user_id=? AND a.consumed_at IS NULL';
    res.json(
      db
        .prepare(`${artifactSelect} ${where} ORDER BY a.created_at DESC`)
        .all(...(req.user.role === 'admin' ? [] : [req.user.id]))
    );
  });
  app.get('/api/v1/admin/artifacts/:id/files', adminAuth, (req, res, next) => {
    try {
      const artifact = visibleArtifact(db, req, req.params.id),
        files = [...readArtifactZip(artifactFile(packagesPath, artifact)).values()]
          .map(({ data, ...item }) => item)
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      res.json({ artifact, files });
    } catch (e) {
      next(e);
    }
  });
  app.get('/api/v1/admin/artifacts/:id/download', adminAuth, (req, res, next) => {
    try {
      const artifact = visibleArtifact(db, req, req.params.id),
        file = artifactFile(packagesPath, artifact);
      res.download(file, artifact.original_name);
    } catch (e) {
      next(e);
    }
  });
  app.delete('/api/v1/admin/artifacts/:id', adminAuth, (req, res, next) => {
    try {
      const artifact = visibleArtifact(db, req, req.params.id),
        file = artifactFile(packagesPath, artifact);
      db.prepare('DELETE FROM ci_artifact WHERE id=?').run(artifact.id);
      if (fs.existsSync(file)) fs.unlinkSync(file);
      res.json({ deleted: true });
    } catch (e) {
      next(e);
    }
  });
  app.post('/api/v1/admin/artifacts/merge/preview', adminAuth, (req, res, next) => {
    try {
      const ids = [...new Set(req.body.artifactIds || [])];
      if (ids.length < 2) throw new Error('artifact_merge_requires_two');
      const artifacts = ids.map(id => visibleArtifact(db, req, id)),
        analysis = mergeAnalysis(packagesPath, artifacts);
      res.json({
        productCode: artifacts[0].product_code,
        allowedChannels: analysis.allowedChannels,
        artifacts: artifacts.map(({ id, version, user_name }) => ({ id, version, userName: user_name })),
        files: analysis.byPath.size,
        conflicts: analysis.conflicts
      });
    } catch (e) {
      next(e);
    }
  });
  app.post('/api/v1/admin/artifacts/merge', adminAuth, (req, res, next) => {
    let final;
    try {
      const ids = [...new Set(req.body.artifactIds || [])];
      if (ids.length < 2) throw new Error('artifact_merge_requires_two');
      const artifacts = ids.map(id => visibleArtifact(db, req, id)),
        analysis = mergeAnalysis(packagesPath, artifacts),
        resolutions = req.body.resolutions || {};
      for (const conflict of analysis.conflicts) {
        const key = conflict.path.toLocaleLowerCase('en-US'),
          chosen = conflict.options.find(x => x.artifactId === resolutions[key]);
        if (!chosen) throw new Error('artifact_merge_conflict_resolution_required');
        analysis.selected.set(
          key,
          analysis.byPath.get(key).find(x => x.artifactId === chosen.artifactId)
        );
      }
      const version = String(req.body.version || '').trim(),
        safe = version.replace(/[^a-zA-Z0-9._-]/g, '');
      if (!safe) throw new Error('invalid_version');
      const output = {};
      for (const item of analysis.selected.values()) output[item.name] = item.data;
      const id = crypto.randomUUID();
      final = path.join(incomingPath, `${id}.zip`);
      fs.writeFileSync(final, zipSync(output, { level: 6 }));
      const relative = path.relative(packagesPath, final).replaceAll('\\', '/'),
        originalName = `${safe}.zip`,
        sizeBytes = fs.statSync(final).size,
        packageSha = hashFileSync(final);
      db.prepare(
        'INSERT INTO ci_artifact(id,user_id,product_code,version,channel,file_path,original_name,sha256,size_bytes) VALUES(?,?,?,?,?,?,?,?,?)'
      ).run(
        id,
        req.user.id,
        artifacts[0].product_code,
        version,
        analysis.allowedChannels.includes(artifacts[0].channel) ? artifacts[0].channel : analysis.allowedChannels[0],
        relative,
        originalName,
        packageSha,
        sizeBytes
      );
      for (const channel of analysis.allowedChannels)
        db.prepare('INSERT INTO ci_artifact_channel(artifact_id,channel) VALUES(?,?)').run(id, channel);
      res.status(201).json({ id, version, sha256: packageSha, sizeBytes, files: analysis.selected.size });
    } catch (e) {
      if (final && fs.existsSync(final)) fs.unlinkSync(final);
      next(e);
    }
  });
}
