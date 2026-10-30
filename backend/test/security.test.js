import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { startServer } from './helpers/server.js';

// Bateria de seguranca do painel (Atualizador): sessao e JWT, perfis, isolamento do proxy do Hub, injecao, limites de taxa,
// cabecalhos, corpos abusivos, arquivos sensiveis e vazamento de segredos.

const SERVICE_KEY = 'chave-de-servico-secreta-de-teste-123';
const json = { 'Content-Type': 'application/json' };

// Hub falso: registra o que o painel pediu (para provar o que NAO foi repassado) e confere a chave de servico.
async function fakeHub(t) {
  const calls = [];
  const tenants = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', chunk => (raw += chunk));
    req.on('end', () => {
      calls.push(`${req.method} ${req.url}`);
      const send = (status, body) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (req.headers['x-hub-service-key'] !== SERVICE_KEY) return send(401, { erro: 'sem chave' });
      if (req.method === 'POST' && req.url === '/v1/tenants') {
        const body = JSON.parse(raw);
        const tenant = { id: `t-${tenants.length + 1}`, nome: body.nome, origem: body.origem };
        tenants.push(tenant);
        return send(201, tenant);
      }
      if (req.method === 'GET' && req.url === '/v1/me') return send(200, { tenants });
      if (req.url.endsWith('/prontidao')) return send(200, { itens: [], obrigatorios: 0, faltam: 0 });
      if (req.url.endsWith('/terminals')) return send(200, [{ id: 'term-1', nome: 'Caixa 01' }]);
      if (req.url.startsWith('/v1/admin/logs/')) return send(200, { ok: true });
      if (req.url === '/v1/resumo') return send(200, { pdv: { requisicoes: 0, erros: 0 }, outros: { requisicoes: 0, erros: 0 }, empresas: [] });
      const m = req.url.match(/^\/v1\/tenants\/([^/?]+)$/);
      if (m) return send(200, tenants.find(x => x.id === m[1]) ?? { id: m[1] });
      send(404, { erro: 'nao encontrado' });
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  return { calls, tenants, url: `http://127.0.0.1:${server.address().port}` };
}

// Pedido com o caminho exatamente como escrito (o fetch normaliza '..' e '%2e%2e' antes de enviar e esconderia o ataque).
const raw = (api, path, headers = {}) =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: api.port, path, method: 'GET', headers }, res => {
      let body = '';
      res.on('data', c => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });

async function setup(t, env = {}) {
  const hub = await fakeHub(t);
  const api = await startServer(t, { env: { HUB_API_URL: hub.url, HUB_SERVICE_KEY: SERVICE_KEY, ...env } });
  const admin = await api.login();
  const mkDev = async (username, company) => {
    const r = await api.post(
      '/api/v1/admin/hub/users',
      { name: username, username, password: 'senha-dev-1234', company, document: '11222333000181' },
      admin
    );
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return api.login(username, 'senha-dev-1234');
  };
  return { api, hub, admin, mkDev };
}

test('rotas administrativas exigem sessao valida: sem token, lixo, JWT forjado, alg none e sessao revogada', async t => {
  const { api, admin } = await setup(t);
  const routes = [
    ['GET', '/api/v1/admin/me'],
    ['GET', '/api/v1/admin/dashboard'],
    ['GET', '/api/v1/admin/clients'],
    ['GET', '/api/v1/admin/users'],
    ['POST', '/api/v1/admin/users'],
    ['GET', '/api/v1/admin/products'],
    ['GET', '/api/v1/admin/releases'],
    ['GET', '/api/v1/admin/hub/users'],
    ['POST', '/api/v1/admin/hub/users'],
    ['GET', '/api/v1/admin/hub/me'],
    ['GET', '/api/v1/admin/hub/tenants'],
    ['POST', '/api/v1/admin/hub/tenants'],
    ['GET', '/api/v1/admin/hub/overview'],
    ['GET', '/api/v1/admin/hub/docs'],
    ['GET', '/api/v1/admin/hub/logs/config'],
    ['PUT', '/api/v1/admin/hub/logs/config'],
    ['POST', '/api/v1/admin/hub/logs/clear'],
    ['GET', '/api/v1/admin/hub/proxy/tenants/t-1'],
    ['GET', '/api/v1/admin/notifications'],
    ['GET', '/api/v1/admin/errors/settings']
  ];
  const secret = 'segredo-de-teste-'.repeat(4);
  const forged = jwt.sign({ sub: '1', role: 'admin', sessionId: 'x' }, 'outro-segredo-qualquer-123456');
  const noneAlg = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"sub":"1","role":"admin"}').toString('base64url')}.`;
  const expired = jwt.sign({ sub: '1', role: 'admin' }, secret, { expiresIn: -60 });
  const bad = ['', 'lixo', "' OR 1=1 --", 'a'.repeat(5000), forged, noneAlg, expired];
  for (const [method, url] of routes) {
    const none = await api.json(url, { method, headers: json, body: method === 'GET' ? undefined : '{}' });
    assert.equal(none.status, 401, `sem sessao: ${method} ${url} -> ${none.status}`);
    for (const token of bad) {
      const r = await api.json(url, {
        method,
        headers: { ...json, Authorization: `Bearer ${token}` },
        body: method === 'GET' ? undefined : '{}'
      });
      assert.equal(r.status, 401, `token invalido (${token.slice(0, 15)}): ${method} ${url} -> ${r.status}`);
    }
  }
  // cookie de sessao adulterado tambem nao entra
  const tampered = await api.json('/api/v1/admin/me', { headers: { Cookie: 'central_session=abc.def.ghi' } });
  assert.equal(tampered.status, 401);
  // sessao encerrada (logout) deixa de valer na hora
  const outro = await api.post('/api/v1/auth/login', { user: 'admin', password: api.env.ADMIN_PASSWORD });
  const header = { Authorization: `Bearer ${outro.body.token}` };
  assert.equal((await api.json('/api/v1/admin/me', { headers: header })).status, 200);
  await api.post('/api/v1/auth/logout', {}, header);
  assert.equal((await api.json('/api/v1/admin/me', { headers: header })).status, 401, 'sessao revogada');
  assert.equal((await api.json('/api/v1/admin/me', { headers: admin })).status, 200, 'a outra sessao continua');
});

test('perfis: operador e player nao alcancam funcoes do administrador nem dados de outro player', async t => {
  const { api, admin, hub, mkDev } = await setup(t);
  const dev1 = await mkDev('dev1', 'Casa A');
  const dev2 = await mkDev('dev2', 'Casa B');
  await api.post('/api/v1/admin/products', { code: 'pdv', name: 'PDV' }, admin);
  await api.post(
    '/api/v1/admin/users',
    { name: 'Op', username: 'op1', password: 'senha-op-12345', role: 'operator', productIds: [1], channels: ['test'] },
    admin
  );
  const op = await api.login('op1', 'senha-op-12345');

  const adminOnly = [
    ['GET', '/api/v1/admin/users'],
    ['POST', '/api/v1/admin/users'],
    ['GET', '/api/v1/admin/hub/users'],
    ['POST', '/api/v1/admin/hub/users'],
    ['PATCH', '/api/v1/admin/hub/users/1'],
    ['GET', '/api/v1/admin/hub/overview'],
    ['GET', '/api/v1/admin/hub/logs/config'],
    ['PUT', '/api/v1/admin/hub/logs/config'],
    ['POST', '/api/v1/admin/hub/logs/clear'],
    ['GET', '/api/v1/admin/hub/logs/notifications'],
    ['GET', '/api/v1/admin/hub/cnpj/11222333000181'],
    ['POST', '/api/v1/admin/hub/proxy/cidades/ibge/carregar']
  ];
  for (const [who, headers] of [['player', dev1], ['operador', op]]) {
    for (const [method, url] of adminOnly) {
      const r = await api.json(url, { method, headers: { ...headers, ...json }, body: method === 'GET' ? undefined : '{}' });
      assert.ok([403, 401].includes(r.status), `${who} em ${method} ${url} -> ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
    }
  }
  // operador (sem papel no Hub) nao usa o Hub
  assert.equal((await api.json('/api/v1/admin/hub/tenants', { headers: op })).status, 403);
  assert.equal((await api.json('/api/v1/admin/hub/proxy/tenants/t-1', { headers: op })).status, 403);
  // player nao cria cliente antes de homologado e nao se promove pelo proprio perfil
  assert.equal((await api.post('/api/v1/admin/hub/tenants', { nome: 'X', origem: 'api' }, dev1)).status, 403);
  const self = await api.json('/api/v1/admin/hub/users/2', { method: 'PATCH', headers: { ...dev1, ...json }, body: JSON.stringify({ homologated: true, force: true }) });
  assert.ok([403, 401].includes(self.status), `auto-homologacao: ${self.status}`);
  assert.equal((await api.json('/api/v1/admin/hub/me', { headers: dev1 })).body.homologated, false);
  // cada player ve so o proprio cliente
  assert.deepEqual((await api.json('/api/v1/admin/hub/tenants', { headers: dev1 })).body.map(x => x.nome), ['Casa A']);
  assert.deepEqual((await api.json('/api/v1/admin/hub/tenants', { headers: dev2 })).body.map(x => x.nome), ['Casa B']);
  assert.ok(hub.tenants.length === 2);
});

test('proxy do Hub: nao e proxy aberto (traversal, barras codificadas, metodos e rotas fora da lista)', async t => {
  const { api, admin, hub, mkDev } = await setup(t);
  const dev1 = await mkDev('dev1', 'Casa A'); // t-1
  await mkDev('dev2', 'Casa B'); // t-2
  const before = hub.calls.length;
  const P = '/api/v1/admin/hub/proxy';
  const hostile = [
    '/tenants/t-2',
    '/tenants/t-2/terminals',
    '/tenants/t-1/../t-2/terminals',
    '/tenants/t-1/%2e%2e/t-2/terminals',
    '/tenants/t-1%2f..%2ft-2/terminals',
    '/tenants//t-2/terminals',
    '/tenants/t-2%00/terminals',
    '/tenants/t-2;x/terminals',
    '/tenants/T-2/terminals',
    '/tenants/t-1/terminals/../../../me',
    '/me',
    '/users',
    '/admin/logs/config',
    '/resumo',
    '/tenants',
    '/../me',
    '/%2e%2e/me',
    '/tenants/t-1/outbox/../../t-2/outbox'
  ];
  for (const path of hostile) {
    const r = (path.includes('..') || /%2e/i.test(path)) ? await raw(api, P + path, dev1) : await api.json(P + path, { headers: dev1 });
    assert.ok([400, 403, 404].includes(r.status), `player em ${path}: ${r.status} ${JSON.stringify(r.body ?? r.body).slice(0, 100)}`);
  }
  // metodos nao permitidos na lista (o Hub nem e chamado)
  for (const method of ['PUT', 'PATCH', 'DELETE', 'POST']) {
    const r = await api.json(`${P}/tenants/t-1`, { method, headers: { ...dev1, ...json }, body: method === 'DELETE' ? undefined : '{}' });
    assert.ok([403, 404].includes(r.status) || (method === 'DELETE' && r.status === 409), `${method} /tenants/t-1: ${r.status}`);
  }
  // o Hub so viu pedidos legitimos: nada de t-2, nada de rotas administrativas
  const seen = hub.calls.slice(before);
  assert.deepEqual(seen.filter(c => /t-2|\/me$|\/users|admin\/logs|\/resumo/.test(c)), [], `chegou ao Hub: ${seen.join(' | ')}`);
  // o administrador passa pelas rotas da lista, mas tambem nao escapa para fora dela
  assert.equal((await api.json(`${P}/me`, { headers: admin })).status, 404);
  assert.equal((await raw(api, `${P}/tenants/t-1/../../me`, admin)).status, 404);
  assert.equal((await api.json(`${P}/tenants/t-1`, { headers: admin })).status, 200);
});

test('injecao e autenticacao do login: sem 500, sem enumerar usuario, resposta igual para usuario e senha errados', async t => {
  const { api } = await setup(t);
  const payloads = ["' OR '1'='1", "admin'--", "admin' OR 1=1 --", '"; DROP TABLE app_user; --', '\u0000', 'a'.repeat(20000), '%', '${7*7}', "1' UNION SELECT password_hash FROM app_user--"];
  for (const p of payloads) {
    for (const body of [
      { user: p, password: p },
      { user: 'admin', password: p },
      { user: { $ne: null }, password: { $ne: null } },
      { user: ['admin'], password: ['x'] },
      { user: 'admin' },
      {}
    ]) {
      const r = await api.post('/api/v1/auth/login', body);
      assert.ok([400, 401, 413].includes(r.status), `login com ${JSON.stringify(body).slice(0, 60)}: ${r.status}`);
      assert.doesNotMatch(JSON.stringify(r.body), /sqlite|SQLITE|syntax|node_modules|at \w+ \(/i);
    }
  }
  const unknown = await api.post('/api/v1/auth/login', { user: 'ninguem', password: 'qualquer-senha-123' });
  const wrong = await api.post('/api/v1/auth/login', { user: 'admin', password: 'senha-errada-123' });
  assert.deepEqual([unknown.status, unknown.body], [wrong.status, wrong.body]);
  // a base continua intacta e o login certo funciona
  assert.equal((await api.login()).Authorization.startsWith('Bearer '), true);
  const rows = await api.json('/api/v1/admin/users', { headers: await api.login() });
  assert.ok(Array.isArray(rows.body) && rows.body.length >= 1);
  assert.doesNotMatch(JSON.stringify(rows.body), /password_hash|scrypt|\$2[aby]\$/i, 'hash de senha nao vai para o cliente');
});

test('limite de taxa: forca bruta no login e chute da chave de instalacao viram 429', async t => {
  const { api } = await setup(t, { LOGIN_MAX_FAILURES: '3', LOGIN_IP_MAX_FAILURES: '6', INSTALLATION_KEY_MAX_FAILURES: '5' });
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await api.post('/api/v1/auth/login', { user: 'admin', password: `errada-${i}-xxxxx` })).status);
  assert.deepEqual(codes, [401, 401, 401, 429], 'o 4o erro do mesmo usuario e barrado');
  const blocked = await api.json('/api/v1/auth/login', { method: 'POST', headers: json, body: JSON.stringify({ user: 'admin', password: api.env.ADMIN_PASSWORD }) });
  assert.equal(blocked.status, 429, 'a senha certa tambem e barrada durante o bloqueio');
  assert.ok(blocked.headers.get('retry-after') || blocked.headers.get('ratelimit'), 'informa quando tentar de novo');

  // chave de instalacao errada (terminal chutando): bloqueia o IP depois de poucas falhas, ate para a chave certa
  const statuses = [];
  for (let i = 0; i < 6; i++)
    statuses.push((await api.json('/api/v1/updates/check', { method: 'POST', headers: { Authorization: `Bearer chute-${i}`, ...json }, body: '{}' })).status);
  assert.ok(statuses.slice(0, 5).every(s => s === 401), `primeiras: ${statuses}`);
  assert.equal(statuses[5], 429, 'a 6a tentativa invalida e barrada');
});

test('cabecalhos, cookie de sessao, corpos abusivos e arquivos sensiveis', async t => {
  const { api } = await setup(t, { ERROR_JSON_LIMIT: '1mb' });
  const login = await api.json('/api/v1/auth/login', { method: 'POST', headers: json, body: JSON.stringify({ user: 'admin', password: api.env.ADMIN_PASSWORD }) });
  assert.equal(login.status, 200);
  const h = login.headers;
  assert.equal(h.get('x-powered-by'), null);
  assert.equal(h.get('x-content-type-options'), 'nosniff');
  assert.ok(h.get('content-security-policy') || h.get('x-frame-options'), 'helmet ativo');
  assert.equal(h.get('access-control-allow-origin'), null, 'sem CORS aberto');
  const cookie = h.get('set-cookie') ?? '';
  assert.match(cookie, /HttpOnly/i, 'cookie de sessao so HTTP');
  assert.match(cookie, /SameSite=(Lax|Strict)/i, 'cookie com SameSite');

  // CSRF: formulario de outro site (text/plain / urlencoded) com o cookie da vitima nao executa acao
  const session = cookie.split(';')[0];
  for (const type of ['text/plain', 'application/x-www-form-urlencoded']) {
    const r = await api.json('/api/v1/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': type, Cookie: session, Origin: 'https://evil.example' },
      body: 'name=Invasor&username=invasor&password=senha-invasor-123&role=admin'
    });
    assert.ok(r.status >= 400, `CSRF ${type}: ${r.status}`);
  }
  assert.equal((await api.json('/api/v1/admin/users', { headers: { Cookie: session } })).body.some?.(u => u.username === 'invasor'), false);

  // corpos abusivos
  const big = await api.json('/api/v1/auth/login', { method: 'POST', headers: json, body: JSON.stringify({ user: 'admin', password: 'x'.repeat(2_000_000) }) });
  assert.equal(big.status, 413);
  const broken = await api.json('/api/v1/auth/login', { method: 'POST', headers: json, body: '{"user":' });
  assert.equal(broken.status, 400);
  assert.doesNotMatch(JSON.stringify(broken.body), /SyntaxError|node_modules|at \w+ \(/);
  const deep = await api.json('/api/v1/auth/login', { method: 'POST', headers: json, body: '{"a":'.repeat(4000) + '1' + '}'.repeat(4000) });
  assert.ok(deep.status < 500, `JSON profundo: ${deep.status}`);
  const proto = await api.json('/api/v1/auth/login', { method: 'POST', headers: json, body: '{"__proto__":{"admin":true},"user":"x","password":"y"}' });
  assert.ok(proto.status < 500);

  // arquivos sensiveis e traversal em estaticos
  for (const path of [
    '/.env',
    '/updater.db',
    '/package.json',
    '/src/index.js',
    '/../package.json',
    '/%2e%2e/package.json',
    '/downloads/../updater.db',
    '/downloads/%2e%2e/updater.db',
    '/downloads/..%2f..%2fupdater.db',
    '/downloads/signing.pem',
    '/signing.pem',
    '/.git/config',
    '/etc/passwd'
  ]) {
    const r = await api.request(path).catch(() => ({ status: 0, text: async () => '' }));
    const text = await r.text();
    assert.ok([400, 403, 404].includes(r.status) || r.status === 200 && !/SQLite format|BEGIN (RSA|PRIVATE|EC)|ADMIN_PASSWORD|JWT_SECRET|"name": "central/.test(text), `${path}: ${r.status}`);
    assert.doesNotMatch(text, /SQLite format|BEGIN (RSA |EC )?PRIVATE KEY|ADMIN_PASSWORD|JWT_SECRET|root:x:/, `conteudo sensivel em ${path}`);
  }
});

test('segredos: a chave de servico do Hub e o endereco interno nunca chegam ao navegador', async t => {
  const { api, admin, mkDev } = await setup(t);
  const dev = await mkDev('dev1', 'Casa A');
  const all = [];
  for (const headers of [admin, dev]) {
    for (const url of ['/api/v1/admin/hub/me', '/api/v1/admin/hub/tenants', '/api/v1/admin/hub/docs', '/api/v1/admin/hub/proxy/tenants/t-1', '/api/v1/admin/hub/proxy/tenants/t-1/terminals', '/api/v1/admin/hub/proxy/inexistente'])
      all.push(JSON.stringify((await api.json(url, { headers })).body));
  }
  all.push(JSON.stringify((await api.json('/api/v1/admin/hub/users', { headers: admin })).body));
  const text = all.join('\n');
  assert.ok(!text.includes(SERVICE_KEY), 'chave de servico vazou');
  assert.doesNotMatch(text, /password_hash|scrypt\$|x-hub-service-key/i);
  // Hub fora do ar: a mensagem e generica (sem URL interna, sem chave)
  const down = await startServer(t, { env: { HUB_API_URL: 'http://127.0.0.1:9', HUB_SERVICE_KEY: SERVICE_KEY } });
  const r = await down.json('/api/v1/admin/hub/proxy/tenants/t-1', { headers: await down.login() });
  assert.ok(r.status >= 400);
  assert.doesNotMatch(JSON.stringify(r.body), new RegExp(`${SERVICE_KEY}|127\\.0\\.0\\.1|ECONNREFUSED`));
});

test('carga: o painel segura rajadas de consultas autenticadas e de logins invalidos sem 5xx', async t => {
  const { api, admin } = await setup(t, { LOGIN_MAX_FAILURES: '5', LOGIN_IP_MAX_FAILURES: '10' });
  const total = 300;
  let index = 0;
  const statuses = new Map();
  const latencies = [];
  const worker = async () => {
    while (index < total) {
      const n = index++;
      const t0 = performance.now();
      const r = await api.json(n % 2 ? '/api/v1/admin/me' : '/api/v1/admin/dashboard', { headers: admin });
      latencies.push(performance.now() - t0);
      statuses.set(r.status, (statuses.get(r.status) ?? 0) + 1);
    }
  };
  const t0 = performance.now();
  await Promise.all(Array.from({ length: 30 }, worker));
  latencies.sort((a, b) => a - b);
  const seconds = (performance.now() - t0) / 1000;
  console.log(
    `carga painel: ${total} req em ${seconds.toFixed(1)}s (${(total / seconds).toFixed(0)} req/s) p95=${latencies[Math.floor(total * 0.95)].toFixed(0)}ms status=${JSON.stringify([...statuses])}`
  );
  assert.equal(statuses.get(200), total);
  // rajada de logins invalidos: vira 401 e depois 429, sem derrubar o servidor
  const flood = await Promise.all(Array.from({ length: 40 }, (_, i) => api.post('/api/v1/auth/login', { user: `u${i % 3}`, password: 'qualquer-senha-123' })));
  assert.ok(flood.every(r => [401, 429].includes(r.status)));
  assert.ok(flood.some(r => r.status === 429));
  assert.equal((await api.json('/api/v1/admin/me', { headers: admin })).status, 200, 'o servidor segue de pe');
});
