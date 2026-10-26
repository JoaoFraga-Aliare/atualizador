import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { hashFileSync, textValue } from '../lib/util.js';

// Envio de artefatos pelo pipeline de CI (token de API).
export function registerCiUploadRoutes(app, ctx) {
  const { db, packagesPath, upload, ciAuth } = ctx;
  app.post('/api/v1/ci/artifacts', ciAuth, upload.single('artifact'), (req, res, next) => {
    const file = req.file;
    try {
      if (!file || path.extname(file.originalname).toLowerCase() !== '.zip') throw new Error('zip_required');
      const productCode = textValue(req.body.product) || 'pdv',
        version = textValue(req.body.version),
        channel = ['production', 'beta', 'test'].find(item => req.scopes.channels.includes(item));
      if (!version) throw new Error('version_required');
      const product = db.prepare('SELECT id FROM product WHERE code=? AND active=1').get(productCode);
      if (!product) throw new Error('product_not_found');
      if (!channel || !req.scopes.productIds.includes(product.id)) {
        if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        return res.status(403).json({ error: 'scope_denied' });
      }
      const id = crypto.randomUUID(),
        relativePath = `.incoming/${id}.zip`,
        storedPath = path.join(packagesPath, relativePath);
      fs.renameSync(file.path, storedPath);
      const sha256 = hashFileSync(storedPath),
        sizeBytes = fs.statSync(storedPath).size;
      db.prepare(
        'INSERT INTO ci_artifact(id,user_id,api_token_id,product_code,version,channel,file_path,original_name,sha256,size_bytes) VALUES(?,?,?,?,?,?,?,?,?,?)'
      ).run(
        id,
        req.user.id,
        req.apiToken?.id || null,
        productCode,
        version,
        channel,
        relativePath,
        file.originalname,
        sha256,
        sizeBytes
      );
      for (const allowedChannel of req.scopes.channels)
        db.prepare('INSERT INTO ci_artifact_channel(artifact_id,channel) VALUES(?,?)').run(id, allowedChannel);
      res.status(201).json({
        id,
        product: productCode,
        version,
        channel,
        allowedChannels: req.scopes.channels,
        fileName: file.originalname,
        sha256,
        sizeBytes,
        status: 'pending'
      });
    } catch (e) {
      if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
      next(e);
    }
  });
}
