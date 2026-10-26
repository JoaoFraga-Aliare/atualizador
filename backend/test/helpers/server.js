import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); });
  });
}

// Sobe a API real num processo separado, com banco e pastas temporarios.
export async function startServer(t, overrides = {}) {
  const directory = overrides.directory || fs.mkdtempSync(path.join(os.tmpdir(), 'central-routes-'));
  const port = await freePort();
  const env = {
    ...process.env,
    PORT: String(port),
    DATABASE_PATH: path.join(directory, 'updater.db'),
    PACKAGES_PATH: path.join(directory, 'packages'),
    DATABASE_BACKUPS_PATH: path.join(directory, 'bancos'),
    PACKAGE_SIGNING_KEY_PATH: path.join(directory, 'signing.pem'),
    DOWNLOAD_BASE_URL: '/downloads',
    ADMIN_USER: 'admin',
    ADMIN_PASSWORD: 'senha-admin-123',
    JWT_SECRET: 'segredo-de-teste-'.repeat(4),
    INSTALLATION_KEY: 'chave-instalacao-teste',
    LOGIN_MAX_FAILURES: '1000',
    LOGIN_IP_MAX_FAILURES: '1000',
    INSTALLATION_KEY_MAX_FAILURES: '1000',
    ...overrides.env
  };
  const child = spawn(process.execPath, ['src/index.js'], { cwd: backendDir, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const base = `http://127.0.0.1:${port}`;
  const stop = () => new Promise(resolve => { if (child.exitCode !== null) return resolve(); child.once('exit', resolve); child.kill(); });
  t.after(async () => { await stop(); if (!overrides.directory) fs.rmSync(directory, { recursive: true, force: true }); });
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`API encerrou ao iniciar:\n${output}`);
    try { if ((await fetch(`${base}/health`)).ok) break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    if (attempt === 149) throw new Error(`API nao respondeu:\n${output}`);
  }
  const installationHeaders = { Authorization: `Bearer ${env.INSTALLATION_KEY}`, 'Content-Type': 'application/json' };
  const api = {
    base, env, directory, port, stop,
    output: () => output,
    request: (url, options = {}) => fetch(base + url, options),
    json: async (url, options = {}) => {
      const response = await fetch(base + url, options);
      const text = await response.text();
      let body; try { body = JSON.parse(text); } catch { body = text; }
      return { status: response.status, body, headers: response.headers };
    },
    installationHeaders,
    post: (url, body, headers = {}) => api.json(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }),
    async login(user = 'admin', password = env.ADMIN_PASSWORD) {
      const result = await api.post('/api/v1/auth/login', { user, password });
      if (result.status !== 200) throw new Error(`login falhou: ${result.status} ${JSON.stringify(result.body)}`);
      return { Authorization: `Bearer ${result.body.token}` };
    },
    check(body) {
      return api.post('/api/v1/updates/check', { client: { id: 'cliente-1', name: 'Cliente 1' }, terminal: { id: 'terminal-1', name: 'CAIXA 01' }, product: 'pdv', channel: 'production', currentVersion: '1.0.0', ...body }, installationHeaders);
    }
  };
  return api;
}
