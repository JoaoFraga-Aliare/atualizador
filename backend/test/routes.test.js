import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { startServer } from './helpers/server.js';
import { releaseSignaturePayload } from '../src/release-signature.js';

const WebSocket = createRequire(import.meta.url)('ws');
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const future = (days = 1) => new Date(Date.now() + days * 86400e3).toISOString();
const packageZip = (exe = 'EXE') => new Blob([zipSync({ 'pdv.exe': strToU8(exe), 'lib/a.dll': strToU8('DLL') })]);

async function createProduct(api, admin, code = 'pdv') {
  const result = await api.post('/api/v1/admin/products', { code, name: code.toUpperCase() }, admin);
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body.id;
}

async function publish(api, admin, fields, file = packageZip()) {
  const form = new FormData();
  for (const [name, value] of Object.entries({
    channel: 'production',
    deadlineAt: future(),
    targetType: 'all',
    artifactType: 'package',
    ...fields
  }))
    form.append(name, String(value));
  if (file) form.append('package', file, 'pacote.zip');
  return api.json('/api/v1/admin/releases', { method: 'POST', headers: admin, body: form });
}

async function signingPublicKey(api) {
  const { body } = await api.json('/api/v1/packages/signing-key');
  return crypto.createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(body.publicKey, 'base64').toString('base64url') },
    format: 'jwk'
  });
}

function signatureIsValid(publicKey, response, product, channel) {
  const payload = releaseSignaturePayload({
    releaseId: response.releaseId,
    product,
    channel,
    version: response.version,
    sha256: response.sha256,
    sizeBytes: response.sizeBytes
  });
  return crypto.verify(null, Buffer.from(payload, 'utf8'), publicKey, Buffer.from(response.signature, 'base64'));
}

test('update check, publishing, targeting, signature and admin listings', async t => {
  const api = await startServer(t);
  const admin = await api.login();
  const productId = await createProduct(api, admin);

  const first = await publish(api, admin, { productId, version: '2.0.0' });
  assert.equal(first.status, 201, JSON.stringify(first.body));

  let check = await api.check();
  assert.equal(check.status, 200);
  assert.equal(check.body.available, true);
  assert.equal(check.body.version, '2.0.0');
  assert.equal(check.body.mandatory, false);
  assert.equal(check.body.mandatoryNow, false);
  const publicKey = await signingPublicKey(api);
  assert.equal(signatureIsValid(publicKey, check.body, 'pdv', 'production'), true);
  assert.equal(signatureIsValid(publicKey, check.body, 'pdv', 'beta'), false);

  const download = Buffer.from(await (await api.request(check.body.downloadUrl)).arrayBuffer());
  assert.equal(sha256(download), check.body.sha256);
  assert.equal(download.length, check.body.sizeBytes);
  const manifest = JSON.parse(Buffer.from(unzipSync(download)['manifest.json']).toString('utf8'));
  assert.equal(manifest.entryPoint, 'pdv.exe');
  assert.equal(manifest.version, '2.0.0');
  assert.deepEqual(
    manifest.files.map(item => item.source),
    ['lib/a.dll', 'pdv.exe']
  );

  check = await api.check({ currentVersion: '2.0.0' });
  assert.equal(check.body.available, false);
  assert.equal(check.body.message, 'Terminal já está atualizado.');

  check = await api.check({ currentVersion: '2.0.0', currentExecutableHash: sha256('EXE') });
  assert.equal(check.body.currentAuthorized, true);
  check = await api.check({ currentVersion: '2.0.0', currentExecutableHash: sha256('OUTRO') });
  assert.equal(check.body.currentAuthorized, false);
  // Hash nao homologado: a Central libera a ultima publicacao para o terminal se corrigir.
  assert.equal(check.body.available, true);
  assert.equal(check.body.version, '2.0.0');

  const clients = await api.json('/api/v1/admin/clients', { headers: admin });
  assert.equal(clients.status, 200);
  const clientList = Array.isArray(clients.body) ? clients.body : clients.body.items;
  const client = clientList.find(item => item.external_id === 'cliente-1' || item.externalId === 'cliente-1');
  assert.ok(client, JSON.stringify(clients.body));
  const targeted = await publish(api, admin, {
    productId,
    version: '2.1.0',
    targetType: 'client',
    targetClientIds: JSON.stringify([client.id])
  });
  assert.equal(targeted.status, 201, JSON.stringify(targeted.body));
  assert.equal((await api.check()).body.version, '2.1.0');
  const other = await api.check({
    client: { id: 'cliente-2', name: 'Cliente 2' },
    terminal: { id: 'terminal-2', name: 'CAIXA 02' }
  });
  assert.equal(other.body.version, '2.0.0');

  const blocked = await api.json(`/api/v1/admin/releases/${targeted.body.id}`, {
    method: 'PATCH',
    headers: { ...admin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocked: true })
  });
  assert.equal(blocked.status, 200, JSON.stringify(blocked.body));
  assert.equal((await api.check()).body.version, '2.0.0');

  const copy = await api.post(
    `/api/v1/admin/releases/${first.body.id}/copy`,
    { channel: 'beta', targetType: 'all', deadlineAt: future() },
    admin
  );
  assert.equal(copy.status, 201, JSON.stringify(copy.body));
  check = await api.check({ channel: 'beta' });
  assert.equal(check.body.version, '2.0.0');
  assert.equal(signatureIsValid(publicKey, check.body, 'pdv', 'beta'), true);

  const mandatory = await publish(api, admin, { productId, version: '3.0.0', mandatory: 'true' });
  assert.equal(mandatory.status, 201, JSON.stringify(mandatory.body));
  check = await api.check();
  assert.equal(check.body.version, '3.0.0');
  assert.equal(check.body.mandatory, true);
  assert.equal(check.body.mandatoryNow, true);
  assert.equal(check.body.mandatoryReason, 'configured');

  const event = body => api.post('/api/v1/updates/events', body, api.installationHeaders);
  assert.equal(
    (
      await event({
        terminalId: 'terminal-1',
        status: 'success',
        previousVersion: '2.0.0',
        targetVersion: '3.0.0',
        message: 'ok'
      })
    ).status,
    202
  );
  assert.equal((await event({ terminalId: 'terminal-1' })).body.error, 'invalid_status');
  assert.equal((await event({ terminalId: 'terminal-1', status: 'com espaco' })).status, 400);
  assert.equal((await event({ terminalId: { x: 1 }, status: 'success' })).body.error, 'invalid_terminal_id');
  assert.equal(
    (await event({ terminalId: 'terminal-1', status: 'success', targetVersion: 'x'.repeat(51) })).body.error,
    'invalid_targetVersion'
  );
  assert.equal((await event({ terminalId: 'nao-existe', status: 'success' })).status, 404);

  const terminal = (await api.json(`/api/v1/admin/clients/${client.id}/terminals`, { headers: admin })).body;
  const terminalId = (Array.isArray(terminal) ? terminal : terminal.items || terminal.terminals)[0].id;
  assert.equal((Array.isArray(terminal) ? terminal : terminal.items || terminal.terminals)[0].executable_status, 'outdated');
  const releaseId = first.body.id;
  const listings = [
    '/api/v1/admin/me',
    '/api/v1/admin/dashboard',
    '/api/v1/admin/clients',
    `/api/v1/admin/clients/${client.id}/terminals`,
    `/api/v1/admin/terminals/${terminalId}`,
    `/api/v1/admin/terminals/${terminalId}/logs`,
    `/api/v1/admin/terminals/${terminalId}/database`,
    `/api/v1/admin/terminals/${terminalId}/database/history`,
    `/api/v1/admin/terminals/${terminalId}/live-events`,
    `/api/v1/admin/terminals/${terminalId}/errors/analysis`,
    `/api/v1/admin/clients/${client.id}/database/history`,
    '/api/v1/admin/database/settings',
    '/api/v1/admin/products',
    `/api/v1/admin/products/${productId}/delete-impact`,
    `/api/v1/admin/products/${productId}/themes`,
    '/api/v1/admin/releases',
    `/api/v1/admin/releases/${releaseId}/details`,
    `/api/v1/admin/releases/${releaseId}/delete-impact`,
    '/api/v1/admin/logs',
    '/api/v1/admin/errors',
    '/api/v1/admin/errors/settings',
    '/api/v1/admin/errors/analysis',
    '/api/v1/admin/notifications',
    '/api/v1/admin/hash-notifications',
    '/api/v1/admin/notification-reads',
    '/api/v1/admin/users',
    '/api/v1/admin/me/api-tokens',
    '/api/v1/admin/me/api-token',
    '/api/v1/admin/artifacts',
    '/api/v1/admin/release-cleanup'
  ];
  for (const url of listings) {
    const result = await api.json(url, { headers: admin });
    assert.equal(result.status, 200, `${url}: ${result.status} ${JSON.stringify(result.body).slice(0, 200)}`);
  }
  assert.equal((await api.json('/api/v1/admin/dashboard')).status, 401);
  assert.equal((await api.json('/api-docs.json')).status, 200);
  assert.equal((await api.json('/downloads/nao-existe.zip')).status, 404);
});

test('database backups stay private and follow the request flow', async t => {
  const api = await startServer(t);
  const admin = await api.login();
  await api.check();
  const clients = (await api.json('/api/v1/admin/clients', { headers: admin })).body;
  const client = (Array.isArray(clients) ? clients : clients.items)[0];
  const terminals = (await api.json(`/api/v1/admin/clients/${client.id}/terminals`, { headers: admin })).body;
  const terminal = (Array.isArray(terminals) ? terminals : terminals.items || terminals.terminals)[0];

  assert.equal(
    (await api.json(`/api/v1/admin/terminals/${terminal.id}/database/request`, { method: 'POST', headers: admin }))
      .status,
    200
  );
  const pending = await api.json('/api/v1/database/request?terminalId=terminal-1', {
    headers: api.installationHeaders
  });
  assert.equal(pending.status, 200);
  assert.ok(pending.body.requested || pending.body.requestedAt, JSON.stringify(pending.body));

  const form = new FormData();
  form.append('terminalId', 'terminal-1');
  form.append('database', new Blob(['BANCO']), 'banco do caixa.zip');
  const upload = await api.json('/api/v1/database/upload', {
    method: 'POST',
    headers: { Authorization: api.installationHeaders.Authorization },
    body: form
  });
  assert.equal(upload.status, 201, JSON.stringify(upload.body));
  assert.equal((await api.json(`/downloads/bancos/${terminal.id}/`)).status, 404);

  const latest = await api.request(`/api/v1/admin/terminals/${terminal.id}/database/download`, { headers: admin });
  assert.equal(latest.status, 200);
  assert.equal(await latest.text(), 'BANCO');
  assert.equal((await api.request(`/api/v1/admin/database/uploads/${upload.body.id}/download`)).status, 401);
  const removed = await api.json(`/api/v1/admin/database/uploads/${upload.body.id}`, {
    method: 'DELETE',
    headers: admin
  });
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
  assert.equal(
    (await api.request(`/api/v1/admin/database/uploads/${upload.body.id}/download`, { headers: admin })).status,
    404
  );
});

test('encrypted application errors are stored and decrypted for the panel', async t => {
  const api = await startServer(t);
  const admin = await api.login();
  await api.check();
  const salt = crypto.randomBytes(32),
    iv = crypto.randomBytes(12);
  const key = Buffer.from(
    crypto.hkdfSync(
      'sha256',
      Buffer.from(`terminal-1:${api.env.INSTALLATION_KEY}`),
      salt,
      Buffer.from('central-atualizacao:error-payload:v1'),
      32
    )
  );
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(
      JSON.stringify({
        exceptionClass: 'EAccessViolation',
        message: 'Falha de teste',
        occurredAt: new Date().toISOString(),
        version: '1.0.0'
      })
    ),
    cipher.final()
  ]);
  const sent = await api.post(
    '/api/v1/errors',
    {
      terminalId: 'terminal-1',
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64')
    },
    api.installationHeaders
  );
  assert.ok(sent.status >= 200 && sent.status < 300, JSON.stringify(sent.body));
  const tampered = await api.post(
    '/api/v1/errors',
    {
      terminalId: 'terminal-1',
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      authTag: Buffer.alloc(16).toString('base64'),
      ciphertext: ciphertext.toString('base64')
    },
    api.installationHeaders
  );
  assert.equal(tampered.status, 400);
  const list = await api.json('/api/v1/admin/errors', { headers: admin });
  assert.equal(list.status, 200);
  const items = Array.isArray(list.body) ? list.body : list.body.items;
  assert.equal(items.length, 1, JSON.stringify(list.body).slice(0, 300));
  const detail = await api.json(`/api/v1/admin/errors/${items[0].id}`, { headers: admin });
  assert.equal(detail.status, 200);
  assert.match(JSON.stringify(detail.body), /Falha de teste/);
});

test('CI token uploads an artifact that becomes a release', async t => {
  const api = await startServer(t);
  const admin = await api.login();
  const productId = await createProduct(api, admin);
  const token = await api.post(
    '/api/v1/admin/me/api-tokens',
    { name: 'CI', productIds: [productId], channels: ['production'] },
    admin
  );
  assert.equal(token.status, 201, JSON.stringify(token.body));
  const secret = token.body.token || token.body.apiToken;
  assert.ok(secret, JSON.stringify(token.body));
  const form = new FormData();
  form.append('product', 'pdv');
  form.append('version', '5.0.0');
  form.append('artifact', packageZip('CI'), 'build.zip');
  const upload = await api.json('/api/v1/ci/artifacts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
    body: form
  });
  assert.equal(upload.status, 201, JSON.stringify(upload.body));
  const artifactId = upload.body.id || upload.body.artifactId;
  const denied = await api.json('/api/v1/ci/artifacts', {
    method: 'POST',
    headers: { Authorization: 'Bearer token-invalido' },
    body: new FormData()
  });
  assert.equal(denied.status, 401);
  const release = await publish(api, admin, { productId, version: '5.0.0', artifactId }, null);
  assert.equal(release.status, 201, JSON.stringify(release.body));
  assert.equal((await api.check()).body.version, '5.0.0');
});

test('operators only see their products and channels', async t => {
  const api = await startServer(t);
  const admin = await api.login();
  const pdv = await createProduct(api, admin, 'pdv');
  const integrador = await createProduct(api, admin, 'integrador');
  assert.equal((await publish(api, admin, { productId: pdv, version: '1.1.0' })).status, 201);
  assert.equal((await publish(api, admin, { productId: integrador, version: '1.1.0' })).status, 201);
  const user = await api.post(
    '/api/v1/admin/users',
    {
      username: 'operador',
      name: 'Operador',
      password: 'senha-operador',
      role: 'operator',
      productIds: [pdv],
      channels: ['production']
    },
    admin
  );
  assert.equal(user.status, 201, JSON.stringify(user.body));
  const operator = await api.login('operador', 'senha-operador');
  const releases = await api.json('/api/v1/admin/releases', { headers: operator });
  assert.equal(releases.status, 200);
  const list = Array.isArray(releases.body) ? releases.body : releases.body.items;
  assert.ok(list.length >= 1 && list.every(item => item.product_id === pdv), JSON.stringify(list).slice(0, 300));
  assert.equal((await api.post('/api/v1/admin/products', { code: 'x', name: 'X' }, operator)).status, 403);
});

test('authentication failures are rate limited', async t => {
  const api = await startServer(t, {
    env: { LOGIN_MAX_FAILURES: '3', LOGIN_IP_MAX_FAILURES: '5', INSTALLATION_KEY_MAX_FAILURES: '4' }
  });
  const login = (user, password) => api.post('/api/v1/auth/login', { user, password });
  for (let i = 0; i < 4; i += 1) assert.equal((await login('admin', api.env.ADMIN_PASSWORD)).status, 200);
  for (let i = 0; i < 3; i += 1) assert.equal((await login('admin', 'errada')).status, 401);
  assert.equal((await login('admin', api.env.ADMIN_PASSWORD)).status, 429);
  assert.equal((await login('fulano', 'x')).status, 401);
  await login('beltrano', 'x');
  assert.equal((await login('ciclano', 'x')).status, 429);

  await api.check();
  const close = url =>
    new Promise(resolve => {
      const ws = new WebSocket(url);
      ws.on('message', data => {
        resolve(JSON.parse(String(data)).kind);
        ws.close();
      });
      ws.on('close', (_code, reason) => resolve(String(reason)));
      ws.on('error', () => {});
    });
  const live = `ws://127.0.0.1:${api.port}/api/v1/live`;
  assert.equal(await close(`${live}?token=${api.env.INSTALLATION_KEY}&terminalId=terminal-1`), 'hello');
  for (let i = 0; i < 4; i += 1)
    assert.equal(await close(`${live}?token=errada&terminalId=terminal-1`), 'unauthorized');
  assert.equal(await close(`${live}?token=${api.env.INSTALLATION_KEY}&terminalId=terminal-1`), 'too_many_attempts');

  for (let i = 0; i < 4; i += 1)
    assert.equal((await api.post('/api/v1/updates/check', {}, { Authorization: 'Bearer errada' })).status, 401);
  assert.equal((await api.check()).status, 429);
});

test('terminals receive their own key and the global key stops working once it is confirmed', async t => {
  const api = await startServer(t);
  const admin = await api.login();
  const first = await api.check();
  assert.match(first.body.terminalKey, /^tk_/);
  const second = await api.check();
  assert.match(second.body.terminalKey, /^tk_/);
  assert.notEqual(second.body.terminalKey, first.body.terminalKey);
  const keyHeaders = { Authorization: `Bearer ${second.body.terminalKey}`, 'Content-Type': 'application/json' };
  assert.equal(
    (
      await api.post(
        '/api/v1/updates/events',
        { terminalId: 'terminal-1', status: 'success' },
        { Authorization: `Bearer ${first.body.terminalKey}` }
      )
    ).status,
    401
  );

  assert.equal(
    (await api.post('/api/v1/updates/events', { terminalId: 'terminal-1', status: 'success' }, keyHeaders)).status,
    202
  );
  const blocked = await api.check();
  assert.equal(blocked.status, 401);
  assert.equal(blocked.body.error, 'terminal_key_required');
  const withKey = await api.post(
    '/api/v1/updates/check',
    {
      client: { id: 'cliente-1', name: 'Cliente 1' },
      terminal: { id: 'terminal-1', name: 'CAIXA 01' },
      currentVersion: '1.0.0'
    },
    keyHeaders
  );
  assert.equal(withKey.status, 200);
  assert.equal(withKey.body.terminalKey, undefined);
  assert.equal(
    (await api.post('/api/v1/updates/events', { terminalId: 'outro', status: 'success' }, keyHeaders)).body.error,
    'terminal_mismatch'
  );
  assert.equal((await api.check({ terminal: { id: 'terminal-2', name: 'CAIXA 02' } })).status, 200);

  const uploadWith = authorization => {
    const form = new FormData();
    form.append('terminalId', 'terminal-1');
    form.append('database', new Blob(['BANCO']), 'banco.zip');
    return api.json('/api/v1/database/upload', {
      method: 'POST',
      headers: { Authorization: authorization },
      body: form
    });
  };
  assert.equal((await uploadWith(api.installationHeaders.Authorization)).body.error, 'terminal_key_required');
  assert.equal((await uploadWith(keyHeaders.Authorization)).status, 201);

  const close = url =>
    new Promise(resolve => {
      const ws = new WebSocket(url);
      ws.on('message', data => {
        resolve(JSON.parse(String(data)).kind);
        ws.close();
      });
      ws.on('close', (_code, reason) => resolve(String(reason)));
      ws.on('error', () => {});
    });
  const live = `ws://127.0.0.1:${api.port}/api/v1/live?terminalId=terminal-1&token=`;
  assert.equal(await close(live + api.env.INSTALLATION_KEY), 'terminal_key_required');
  assert.equal(await close(live + second.body.terminalKey), 'hello');

  const clients = (await api.json('/api/v1/admin/clients', { headers: admin })).body;
  const client = clients.find(item => item.external_id === 'cliente-1');
  const terminals = (await api.json(`/api/v1/admin/clients/${client.id}/terminals`, { headers: admin })).body;
  const terminal = terminals.find(item => item.external_id === 'terminal-1');
  assert.equal(terminal.terminal_key_status, 'confirmed');
  assert.equal('api_key_hash' in terminal, false);
  assert.equal(
    (await api.json(`/api/v1/admin/terminals/${terminal.id}/reset-key`, { method: 'POST', headers: admin })).status,
    200
  );
  assert.equal(
    (await api.json(`/api/v1/admin/terminals/${terminal.id}`, { headers: admin })).body.terminal_key_status,
    'none'
  );
  assert.equal(
    (await api.post('/api/v1/updates/events', { terminalId: 'terminal-1', status: 'success' }, keyHeaders)).status,
    401
  );
  const again = await api.check();
  assert.equal(again.status, 200);
  assert.match(again.body.terminalKey, /^tk_/);
});

test('TERMINAL_KEY_ENFORCEMENT=off keeps the global key valid during the transition', async t => {
  const api = await startServer(t, { env: { TERMINAL_KEY_ENFORCEMENT: 'off' } });
  const { body } = await api.check();
  assert.equal(
    (
      await api.post(
        '/api/v1/updates/events',
        { terminalId: 'terminal-1', status: 'success' },
        { Authorization: `Bearer ${body.terminalKey}` }
      )
    ).status,
    202
  );
  const check = await api.check();
  assert.equal(check.status, 200);
  assert.equal(check.body.terminalKey, undefined);
});

test('panel sessions use an httpOnly cookie and can be revoked', async t => {
  const api = await startServer(t);
  const login = await api.request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: 'admin', password: api.env.ADMIN_PASSWORD })
  });
  assert.equal(login.status, 200);
  const setCookie = login.headers.get('set-cookie');
  assert.match(setCookie, /central_session=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  const { token } = await login.json();
  const cookie = { Cookie: setCookie.split(';')[0] };

  assert.equal((await api.json('/api/v1/admin/me', { headers: cookie })).status, 200);
  const crossSite = await api.json('/api/v1/admin/products', {
    method: 'POST',
    headers: { ...cookie, 'Content-Type': 'application/json', Origin: 'https://outro-site.example' },
    body: JSON.stringify({ code: 'x', name: 'X' })
  });
  assert.equal(crossSite.status, 403);
  assert.equal(crossSite.body.error, 'invalid_origin');
  const sameSite = await api.json('/api/v1/admin/products', {
    method: 'POST',
    headers: { ...cookie, 'Content-Type': 'application/json', Origin: api.base },
    body: JSON.stringify({ code: 'pdv', name: 'PDV' })
  });
  assert.equal(sameSite.status, 201);

  const logout = await api.request('/api/v1/auth/logout', { method: 'POST', headers: cookie });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie'), /central_session=;/);
  assert.equal((await api.json('/api/v1/admin/me', { headers: cookie })).status, 401);
  assert.equal((await api.json('/api/v1/admin/me', { headers: { Authorization: `Bearer ${token}` } })).status, 401);

  const admin = await api.login();
  const user = await api.post(
    '/api/v1/admin/users',
    { username: 'maria', name: 'Maria', password: 'senha-maria-1', role: 'admin' },
    admin
  );
  const maria = await api.login('maria', 'senha-maria-1');
  assert.equal((await api.json('/api/v1/admin/me', { headers: maria })).status, 200);
  await api.json(`/api/v1/admin/users/${user.body.id}`, {
    method: 'PATCH',
    headers: { ...admin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ active: false })
  });
  await api.json(`/api/v1/admin/users/${user.body.id}`, {
    method: 'PATCH',
    headers: { ...admin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ active: true })
  });
  assert.equal((await api.json('/api/v1/admin/me', { headers: maria })).status, 401);
});

test('gradual rollout, health check and JSON access logs', async t => {
  const api = await startServer(t);
  const admin = await api.login();
  const productId = await createProduct(api, admin);
  assert.equal(
    (await publish(api, admin, { productId, version: '2.0.0', rolloutPercent: '0' })).body.error,
    'invalid_rollout_percent'
  );
  const release = await publish(api, admin, { productId, version: '2.0.0', rolloutPercent: '30' });
  assert.equal(release.status, 201, JSON.stringify(release.body));
  const terminalIds = Array.from({ length: 40 }, (_, i) => `terminal-rollout-${i}`);
  const receives = async () => {
    const result = [];
    for (const id of terminalIds) if ((await api.check({ terminal: { id, name: id } })).body.available) result.push(id);
    return result;
  };
  const partial = await receives();
  assert.ok(partial.length > 0 && partial.length < terminalIds.length, `${partial.length} de ${terminalIds.length}`);
  const patch = body =>
    api.json(`/api/v1/admin/releases/${release.body.id}`, {
      method: 'PATCH',
      headers: { ...admin, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  assert.equal((await patch({ rolloutPercent: 60 })).status, 200);
  const wider = await receives();
  assert.ok(
    partial.every(id => wider.includes(id)),
    'quem ja recebia continua recebendo'
  );
  assert.equal((await patch({ rolloutPercent: 100 })).status, 200);
  assert.equal((await receives()).length, terminalIds.length);
  assert.equal((await patch({ rolloutPercent: 101 })).status, 400);

  const health = await api.json('/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.checks.database, 'ok');
  assert.ok(health.body.checks.packages.freeBytes > 0);
  assert.match(
    api.output(),
    /\{"time":"[^"]+","level":"info","method":"POST","path":"\/api\/v1\/updates\/check","status":200/
  );
});

test('health check reports 503 when free space is below the threshold', async t => {
  const api = await startServer(t, { env: { HEALTH_MIN_FREE_MB: String(1024 * 1024 * 1024) } });
  const health = await api.json('/health');
  assert.equal(health.status, 503);
  assert.equal(health.body.ok, false);
  assert.equal(health.body.checks.database, 'ok');
  assert.equal(health.body.checks.packages.ok, false);
});
