import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const THEMES = new Set(['agrosys', 'aliare']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp']);
const COLOR_KEYS = ['borderColor', 'fontColor', 'errorColor', 'gridSelectionColor', 'gridSelectionFontColor'];

function json(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
function publicUrl(req, file) {
  return file ? `${req.protocol}://${req.get('host')}/downloads/${String(file).replaceAll('\\', '/')}` : null;
}
function themeHash(row) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        id: row.id,
        theme: row.theme,
        settings: json(row.settings, {}),
        logo: row.logo_path,
        background: row.background_path,
        startImages: json(row.start_images, []),
        updatedAt: row.updated_at
      })
    )
    .digest('hex');
}
function serialize(req, row) {
  const settings = json(row.settings, {});
  return {
    id: row.id,
    hash: themeHash(row),
    productId: row.product_id,
    theme: row.theme,
    name: row.name,
    isDefault: Boolean(row.is_default),
    priority: row.priority,
    startDate: row.start_date,
    endDate: row.end_date,
    weekdays: json(row.weekdays, []),
    specificDates: json(row.specific_dates, []),
    settings,
    logoUrl: publicUrl(req, row.logo_path),
    backgroundUrl: publicUrl(req, row.background_path),
    startImageUrls: json(row.start_images, []).map(file => publicUrl(req, file)),
    active: Boolean(row.active),
    updatedAt: row.updated_at
  };
}
function dateInVariant(row, date) {
  const day = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-'),
    weekDay = date.getDay();
  if ((row.start_date && day < row.start_date) || (row.end_date && day > row.end_date)) return false;
  const dates = json(row.specific_dates, []),
    weekdays = json(row.weekdays, []);
  return (!dates.length && !weekdays.length) || dates.includes(day) || weekdays.includes(weekDay);
}
function validateSettings(theme, value) {
  const settings = typeof value === 'object' && value ? value : {};
  if (theme === 'agrosys') return {};
  for (const key of COLOR_KEYS)
    if (settings[key] && !/^#[0-9a-f]{6}$/i.test(settings[key])) throw new Error(`invalid_${key}`);
  const width = Number(settings.logoWidth ?? 191),
    height = Number(settings.logoHeight ?? 35);
  if (!Number.isInteger(width) || width < 1 || width > 2000 || !Number.isInteger(height) || height < 1 || height > 2000)
    throw new Error('invalid_logo_size');
  return { ...settings, logoWidth: width, logoHeight: height };
}
function saveImage(file, productId, theme, assetsPath) {
  if (!file) return null;
  const extension = path.extname(file.originalname).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) {
    fs.unlinkSync(file.path);
    throw new Error('image_required');
  }
  const relative = `themes/${productId}/${theme}/${crypto.randomUUID()}${extension}`,
    target = path.join(assetsPath, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.renameSync(file.path, target);
  return relative;
}
function removeFiles(files, assetsPath) {
  for (const file of files.filter(Boolean)) {
    const target = path.resolve(assetsPath, file);
    if (target.startsWith(path.resolve(assetsPath) + path.sep) && fs.existsSync(target)) fs.unlinkSync(target);
  }
}

export function registerProductThemeRoutes(app, { db, adminAuth, installationAuth, upload, packagesPath }) {
  app.get('/api/v1/admin/products/:id/themes', adminAuth, (req, res) => {
    if (!req.scopes.all && !req.scopes.productIds.includes(Number(req.params.id)))
      return res.status(403).json({ error: 'scope_denied' });
    res.json(
      db
        .prepare('SELECT * FROM product_theme WHERE product_id=? ORDER BY theme,is_default DESC,priority DESC,id DESC')
        .all(req.params.id)
        .map(row => serialize(req, row))
    );
  });
  app.post(
    '/api/v1/admin/products/:id/themes',
    adminAuth,
    upload.fields([
      { name: 'logo', maxCount: 1 },
      { name: 'background', maxCount: 1 },
      { name: 'startImages', maxCount: 10 }
    ]),
    (req, res, next) => {
      try {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin_required' });
        const product = db.prepare('SELECT id FROM product WHERE id=?').get(req.params.id),
          theme = String(req.body.theme || '').toLowerCase();
        if (!product) return res.status(404).json({ error: 'product_not_found' });
        if (!THEMES.has(theme)) throw new Error('invalid_theme');
        const isDefault = String(req.body.isDefault) === 'true',
          settings = validateSettings(theme, json(req.body.settings, {})),
          weekdays = json(req.body.weekdays, []),
          specificDates = json(req.body.specificDates, []);
        if (
          !Array.isArray(weekdays) ||
          weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6) ||
          !Array.isArray(specificDates) ||
          specificDates.some(date => !/^\d{4}-\d{2}-\d{2}$/.test(date))
        )
          throw new Error('invalid_schedule');
        if (req.body.startDate && req.body.endDate && req.body.startDate > req.body.endDate)
          throw new Error('invalid_period');
        const logo = saveImage(req.files?.logo?.[0], product.id, theme, packagesPath),
          background = saveImage(req.files?.background?.[0], product.id, theme, packagesPath),
          startImages = (req.files?.startImages || []).map(file => saveImage(file, product.id, theme, packagesPath));
        const result = db.transaction(() => {
          if (isDefault)
            db.prepare('DELETE FROM product_theme WHERE product_id=? AND theme=? AND is_default=1').run(
              product.id,
              theme
            );
          return db
            .prepare(
              'INSERT INTO product_theme(product_id,theme,name,is_default,priority,start_date,end_date,weekdays,specific_dates,settings,logo_path,background_path,start_images) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)'
            )
            .run(
              product.id,
              theme,
              String(req.body.name || 'Padrão').trim(),
              isDefault ? 1 : 0,
              Number(req.body.priority || 0),
              req.body.startDate || null,
              req.body.endDate || null,
              JSON.stringify(weekdays),
              JSON.stringify(specificDates),
              JSON.stringify(settings),
              logo,
              background,
              JSON.stringify(startImages)
            );
        })();
        res.status(201).json({ id: Number(result.lastInsertRowid) });
      } catch (error) {
        for (const file of Object.values(req.files || {}).flat())
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        next(error);
      }
    }
  );
  app.delete('/api/v1/admin/products/:productId/themes/:id', adminAuth, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin_required' });
    const row = db
      .prepare('SELECT * FROM product_theme WHERE id=? AND product_id=?')
      .get(req.params.id, req.params.productId);
    if (!row) return res.status(404).json({ error: 'theme_not_found' });
    db.prepare('DELETE FROM product_theme WHERE id=?').run(row.id);
    removeFiles([row.logo_path, row.background_path, ...json(row.start_images, [])], packagesPath);
    res.json({ deleted: true });
  });
  app.get('/api/v1/config/themes/:product/:theme', installationAuth, (req, res) => {
    const theme = String(req.params.theme).toLowerCase(),
      product = db.prepare('SELECT id FROM product WHERE code=? AND active=1').get(req.params.product);
    if (!product) return res.status(404).json({ error: 'product_not_found' });
    if (!THEMES.has(theme)) return res.status(400).json({ error: 'invalid_theme' });
    if (req.query.date && !/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date)))
      return res.status(400).json({ error: 'invalid_date' });
    const requested = req.query.date ? new Date(`${req.query.date}T12:00:00`) : new Date();
    if (Number.isNaN(requested.getTime())) return res.status(400).json({ error: 'invalid_date' });
    const rows = db
        .prepare(
          'SELECT * FROM product_theme WHERE product_id=? AND theme=? AND active=1 ORDER BY is_default ASC,priority DESC,id DESC'
        )
        .all(product.id, theme),
      selected = rows.find(row => !row.is_default && dateInVariant(row, requested)) || rows.find(row => row.is_default);
    if (!selected) return res.status(404).json({ error: 'theme_not_configured' });
    const configuration = serialize(req, selected),
      currentId = String(req.query.currentThemeId || ''),
      currentHash = String(req.query.currentThemeHash || '').toLowerCase(),
      validationRequested = Boolean(currentId || currentHash),
      currentThemeValid =
        validationRequested &&
        (!currentId || currentId === String(configuration.id)) &&
        (!currentHash || currentHash === configuration.hash);
    res.set('ETag', `"${configuration.hash}"`).json({
      product: req.params.product,
      theme,
      referenceDate: [
        requested.getFullYear(),
        String(requested.getMonth() + 1).padStart(2, '0'),
        String(requested.getDate()).padStart(2, '0')
      ].join('-'),
      currentThemeValid: validationRequested ? currentThemeValid : null,
      configuration
    });
  });
}
