import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import multer from 'multer';
import swaggerUi from 'swagger-ui-express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { openDatabase } from './db.js';
import { openApiDocument } from './openapi.js';
import { ensureInitialAdmin } from './auth.js';
import { registerCiArtifactRoutes } from './ci-artifacts.js';
import { registerReleaseCleanupRoutes } from './release-history.js';
import { registerProductThemeRoutes } from './product-themes.js';
import { createReleaseSigner, loadSigningKey } from './release-signature.js';
import { hashFileSync } from './lib/util.js';
import { createLive, attachLiveServer } from './live.js';
import { createScopeHelpers } from './lib/scopes.js';
import { createDatabaseBackups } from './database-backups.js';
import { createAuthMiddleware } from './middleware.js';
import { registerTerminalRoutes } from './routes/terminal.js';
import { registerAccountRoutes } from './routes/account.js';
import { registerCiUploadRoutes } from './routes/ci-upload.js';
import { registerAdminTerminalRoutes } from './routes/admin-terminals.js';
import { registerAdminReleaseRoutes } from './routes/admin-releases.js';
import { registerAdminErrorRoutes } from './routes/admin-errors.js';
import { registerAdminUserRoutes } from './routes/admin-users.js';

// Monta a API: banco, chave de assinatura, middlewares, rotas e WebSocket.
export function createApp() {
  const app = express(),
    port = Number(process.env.PORT || 3333);
  const db = openDatabase(path.resolve(process.env.DATABASE_PATH || './data/updater.db'));
  ensureInitialAdmin(db, process.env.ADMIN_USER, process.env.ADMIN_PASSWORD);
  const signingKey = loadSigningKey(
      path.resolve(process.env.PACKAGE_SIGNING_KEY_PATH || './data/package-signing-key.pem')
    ),
    releaseSigner = createReleaseSigner(db, signingKey);
  if (signingKey.created)
    console.log(
      `Chave de assinatura de pacotes criada (keyId ${signingKey.keyId}). Faca backup do arquivo. Chave publica: ${signingKey.publicKeyBase64}`
    );
  {
    const signed = releaseSigner.signPendingReleases();
    if (signed) console.log(`${signed} publicacao(oes) assinada(s) com a chave ${signingKey.keyId}.`);
  }
  const packagesPath = path.resolve(process.env.PACKAGES_PATH || './packages'),
    downloadBase = String(process.env.DOWNLOAD_BASE_URL || '').replace(/\/$/, '');
  const incomingPath = path.join(packagesPath, '.incoming');
  fs.mkdirSync(packagesPath, { recursive: true });
  fs.mkdirSync(path.join(packagesPath, '.temp'), { recursive: true });
  fs.mkdirSync(incomingPath, { recursive: true });
  // Backups de banco dos clientes ficam fora de packagesPath: tudo que esta la e publico em /downloads.
  const databaseBackupsPath = path.resolve(process.env.DATABASE_BACKUPS_PATH || './data/bancos');
  fs.mkdirSync(databaseBackupsPath, { recursive: true });
  const upload = multer({ dest: path.join(packagesPath, '.temp'), limits: { fileSize: 1024 * 1024 * 1024 } });
  const { liveTerminals, sendLiveCommand, saveLiveEvent } = createLive(db);
  const scopes = createScopeHelpers(db);
  const backups = createDatabaseBackups({ db, packagesPath, databaseBackupsPath });
  backups.migrateLegacyDatabaseBackups();
  const { adminAuth, installationAuth, ciAuth } = createAuthMiddleware(db);
  app.set('trust proxy', Number(process.env.TRUST_PROXY || 1));
  app.use(helmet());
  app.use(express.json({ limit: process.env.ERROR_JSON_LIMIT || '12mb' }));
  app.use(morgan('combined'));
  // Os limites contam so falhas: terminais da mesma loja costumam sair pelo mesmo IP.
  const failureLimit = (limit, options) =>
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skipSuccessfulRequests: true,
      message: { error: 'too_many_attempts' },
      ...options
    });
  const loginUserLimiter = failureLimit(Number(process.env.LOGIN_MAX_FAILURES || 10), {
    keyGenerator: req =>
      `${ipKeyGenerator(req.ip)}:${String(req.body?.user || '')
        .trim()
        .toLowerCase()}`
  });
  const loginIpLimiter = failureLimit(Number(process.env.LOGIN_IP_MAX_FAILURES || 50));
  app.use(
    '/api/v1',
    failureLimit(Number(process.env.INSTALLATION_KEY_MAX_FAILURES || 30), {
      requestWasSuccessful: (_req, res) => !res.locals.installationAuthFailed
    })
  );
  // No desenvolvimento o Next encaminha /downloads para esta rota. Em producao,
  // o Nginx pode continuar servindo a mesma pasta diretamente.
  app.use('/downloads', express.static(packagesPath, { fallthrough: false, index: false }));
  app.get('/api-docs.json', (_q, res) => res.json(openApiDocument));
  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, { customSiteTitle: 'Central de Atualização API' })
  );
  const ctx = {
    db,
    packagesPath,
    incomingPath,
    databaseBackupsPath,
    downloadBase,
    upload,
    signingKey,
    releaseSigner,
    adminAuth,
    installationAuth,
    ciAuth,
    loginIpLimiter,
    loginUserLimiter,
    liveTerminals,
    sendLiveCommand,
    saveLiveEvent,
    ...scopes,
    ...backups
  };
  registerTerminalRoutes(app, ctx);
  registerAccountRoutes(app, ctx);
  registerCiUploadRoutes(app, ctx);
  registerAdminTerminalRoutes(app, ctx);
  registerAdminReleaseRoutes(app, ctx);
  registerCiArtifactRoutes(app, { db, adminAuth, packagesPath, incomingPath, hashFileSync });
  registerReleaseCleanupRoutes(app, { db, adminAuth, packagesPath });
  registerProductThemeRoutes(app, { db, adminAuth, installationAuth, upload, packagesPath });
  registerAdminErrorRoutes(app, ctx);
  registerAdminUserRoutes(app, ctx);
  app.use((e, _q, res, _n) => {
    const status = Number(e.status || e.statusCode);
    if (status === 404) return res.status(404).json({ error: 'not_found' });
    console.error(e);
    res.status(status >= 400 && status < 500 ? status : 400).json({ error: e.message || 'internal_error' });
  });
  const server = http.createServer(app);
  attachLiveServer(server, { app, db, liveTerminals, sendLiveCommand, saveLiveEvent });
  return { app, server, port, db };
}
