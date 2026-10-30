// Modo debug: o painel responde com dados ficticios, sem chamar o backend.
// Ative com /dashboard/?debug=1 e desative com ?debug=0 (ou pelo aviso no topo do painel).
const KEY = 'debugMode';

export function setDebug(on) {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {}
}

// ?debug=1|0 na URL grava a escolha antes de qualquer chamada, mesmo dos componentes filhos.
export function debugEnabled() {
  try {
    const value = new URLSearchParams(location.search).get('debug');
    if (value === '1' || value === '0') setDebug(value === '1');
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export const syncDebugFromUrl = debugEnabled;

const ago = (days, hours = 0) => new Date(Date.now() - days * 86400000 - hours * 3600000).toISOString();
const sql = iso => iso.slice(0, 19).replace('T', ' ');

const products = [
  { id: 1, code: 'pdv', name: 'PDV Frente de Caixa' },
  { id: 2, code: 'fiscal', name: 'Módulo Fiscal' },
  { id: 3, code: 'retaguarda', name: 'Retaguarda' }
];

const clientSeed = [
  ['Morgana Supermercados', 5],
  ['Atacado Silva', 4],
  ['Mercado Sol', 3],
  ['Padaria Real', 2],
  ['Farma Vida', 2],
  ['Casa & Cia', 1],
  ['Auto Peças Norte', 1]
];

const clients = clientSeed.map(([name, count], i) => ({
  id: i + 1,
  name,
  document: `${10 + i}.${300 + i * 7}.${100 + i * 11}/0001-${20 + i}`,
  terminal_count: count,
  last_seen_at: sql(ago(0, i * 5 + 1))
}));

const releaseSeed = [
  [1, '4.2.1', 'production', 9, 100],
  [1, '4.2.0', 'production', 4, 100],
  [1, '4.3.0', 'beta', 3, 50],
  [1, '4.4.0-rc1', 'test', 1, 100],
  [2, '2.8.0', 'production', 5, 100],
  [2, '2.9.0', 'beta', 2, 100],
  [3, '1.15.3', 'production', 3, 100],
  [1, '4.1.9', 'production', 0, 100],
  [1, '4.0.1', 'production', 0, 100],
  [2, '2.5.0', 'beta', 0, 100]
];

const releases = releaseSeed.map(([productId, version, channel, terminals, rollout], i) => ({
  id: i + 1,
  product_id: productId,
  product_name: products.find(p => p.id === productId).name,
  version,
  channel,
  active: 1,
  blocked: 0,
  deleted_at: null,
  rollout_percent: rollout,
  published_at: sql(ago(i * 6 + 1)),
  targets: 'Todos',
  terminal_count: terminals,
  notes: 'Versão fictícia do modo debug.'
}));

const cleanupCandidates = releases
  .filter(r => r.terminal_count === 0)
  .map((r, i) => ({
    ...r,
    latest_version: '4.2.1',
    last_update_at: sql(ago(40 + i * 12)),
    reclaim_bytes: (180 - i * 45) * 1024 * 1024
  }));

const terminalsOf = client =>
  Array.from({ length: client.terminal_count }, (_, i) => ({
    id: client.id * 100 + i,
    name: `Caixa ${String(i + 1).padStart(2, '0')}`,
    computer_name: `PC-${client.name.slice(0, 3).toUpperCase()}-${i + 1}`,
    product_code: i % 3 === 2 ? 'fiscal' : 'pdv',
    channel: i === 0 && client.id % 2 ? 'beta' : 'production',
    current_version: i % 3 === 2 ? '2.8.0' : i === 0 && client.id % 2 ? '4.3.0' : i % 2 ? '4.2.0' : '4.2.1',
    last_seen_at: sql(ago(0, i * 3 + client.id)),
    terminal_key_status: 'active',
    executable_status: 'authorized'
  }));

const exceptions = [
  ['EAccessViolation', 14, 'Access violation at address 0040A1F2 in module PDV.exe'],
  ['EDatabaseError', 9, 'Field NUM_DOC not found'],
  ['EConvertError', 6, "'abc' is not a valid integer value"],
  ['EInOutError', 4, 'I/O error 32: arquivo em uso por outro processo'],
  ['ESocketError', 3, 'Timeout ao conectar no servidor fiscal']
];

const errorItems = exceptions.flatMap(([exception, occurrences, message], i) => {
  const client = clients[i % clients.length];
  return [
    {
      id: 1000 + i,
      client: client.name,
      terminal: `Caixa 0${(i % 3) + 1}`,
      exception,
      message,
      version: i % 2 ? '4.2.0' : '4.2.1',
      occurrences,
      receivedAt: ago(0, i * 7 + 2),
      date: sql(ago(0, i * 7 + 2)),
      screenshots: []
    }
  ];
});

const countBy = key => {
  const map = new Map();
  for (const x of errorItems) map.set(x[key], (map.get(x[key]) || 0) + x.occurrences);
  return [...map].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
};

const logs = Array.from({ length: 40 }, (_, i) => {
  const client = clients[i % clients.length],
    failed = i % 9 === 4;
  return {
    id: i + 1,
    created_at: sql(ago(0, i * 2)),
    status: failed ? 'error' : 'success',
    client_name: client.name,
    terminal_name: `Caixa 0${(i % 3) + 1}`,
    target_version: i % 4 ? '4.2.1' : '4.3.0',
    message: failed ? 'Falha ao baixar o pacote (hash divergente)' : 'Atualização aplicada com sucesso'
  };
});

const users = [
  {
    id: 1,
    name: 'Administrador Debug',
    username: 'admin',
    role: 'admin',
    active: 1,
    channels: 'test,beta,production',
    products: 'Todos'
  },
  {
    id: 2,
    name: 'Operadora Suporte',
    username: 'suporte',
    role: 'operator',
    active: 1,
    channels: 'production',
    products: 'PDV Frente de Caixa'
  },
  {
    id: 3,
    name: 'Dev Homologação',
    username: 'homolog',
    role: 'operator',
    active: 0,
    channels: 'test,beta',
    products: 'Módulo Fiscal'
  }
];

const artifacts = [
  ['pdv', 'PDV Frente de Caixa', '4.4.0', 'test', 'published', 'build-4400.zip'],
  ['pdv', 'PDV Frente de Caixa', '4.3.0', 'beta', 'published', 'build-4300.zip'],
  ['fiscal', 'Módulo Fiscal', '2.9.0', 'beta', 'pending', 'fiscal-290.zip']
].map(([code, name, version, channel, status, file], i) => ({
  id: i + 1,
  product_code: code,
  product_name: name,
  version,
  channel,
  allowed_channels: 'test,beta',
  status,
  original_name: file,
  size_bytes: (45 + i * 12) * 1024 * 1024,
  created_at: sql(ago(i * 3 + 1)),
  user_name: 'Pipeline CI',
  username: 'ci'
}));

const tokens = [
  {
    id: 1,
    name: 'Pipeline principal',
    active: 1,
    channels: ['test', 'beta'],
    productIds: [1, 2],
    createdAt: ago(60),
    expiresAt: ago(-120),
    lastVersion: '4.4.0',
    lastVersionAt: ago(1),
    versionsSent: 37,
    revokedAt: null
  },
  {
    id: 2,
    name: 'Token antigo',
    active: 0,
    channels: ['test'],
    productIds: [1],
    createdAt: ago(200),
    expiresAt: ago(20),
    lastVersion: '3.9.0',
    lastVersionAt: ago(90),
    versionsSent: 12,
    revokedAt: ago(30)
  }
];

const sumTerminals = list => list.reduce((s, c) => s + c.terminal_count, 0);

// Rotas GET; as chaves sao o caminho sem query. Funcoes recebem os parametros da rota.
const routes = {
  '/admin/me': () => ({ id: 1, name: 'Administrador Debug', role: 'admin', scopes: { all: true } }),
  '/admin/dashboard': () => ({
    channels: ['test', 'beta', 'production'],
    clients: clients.length,
    terminals: sumTerminals(clients),
    releases: releases.filter(r => r.terminal_count > 0).length,
    errors: errorItems.reduce((s, x) => s + x.occurrences, 0)
  }),
  '/admin/clients': () => clients,
  '/admin/products': () => products,
  '/admin/releases': () => releases,
  '/admin/logs': () => logs,
  '/admin/users': () => users,
  '/admin/artifacts': () => artifacts,
  '/admin/me/api-tokens': () => tokens,
  '/admin/errors/settings': () => ({ storeScreenshot: true }),
  '/admin/release-cleanup': () => ({
    key: 'release_cleanup:debug',
    date: new Date().toISOString().slice(0, 10),
    count: cleanupCandidates.length,
    sizeBytes: cleanupCandidates.reduce((s, x) => s + x.reclaim_bytes, 0),
    candidates: cleanupCandidates
  }),
  '/admin/notifications': () => ({ items: [], count: 0 }),
  '/admin/hash-notifications': () => ({ items: [], count: 0 }),
  '/admin/notification-reads': () => [],
  '/admin/errors/analysis': () => ({
    items: errorItems,
    options: {
      exceptions: exceptions.map(e => e[0]),
      clients: clients.map(c => c.name),
      versions: ['4.2.0', '4.2.1'],
      products: products.map(p => p.name),
      channels: ['test', 'beta', 'production']
    },
    charts: { byException: countBy('exception'), byClient: countBy('client') },
    uniqueCount: errorItems.length,
    occurrenceCount: errorItems.reduce((s, x) => s + x.occurrences, 0),
    invalidCount: 0,
    period: { maxDays: 90 }
  })
};

export async function debugRequest(path, options = {}) {
  await new Promise(resolve => setTimeout(resolve, 120));
  const clean = path.split('?')[0].replace(/\/$/, ''),
    method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET') return { ok: true, debug: true };
  const terminals = clean.match(/^\/admin\/clients\/(\d+)\/terminals$/);
  if (terminals) return terminalsOf(clients.find(c => c.id === +terminals[1]) || clients[0]);
  if (/^\/admin\/terminals\/\d+\/errors\/analysis$/.test(clean)) return routes['/admin/errors/analysis']();
  if (/^\/admin\/terminals\/\d+\/logs$/.test(clean)) return logs.slice(0, 12);
  const detail = clean.match(/^\/admin\/errors\/(\d+)$/);
  if (detail) {
    const item = errorItems.find(x => x.id === +detail[1]) || errorItems[0];
    return {
      ...item,
      stack: 'PDV.exe  00:0040A1F2  TVenda.Finalizar\nPDV.exe  00:0040B7C0  TFrmCaixa.BtnClick',
      classification: null
    };
  }
  const handler = routes[clean];
  return handler ? handler() : [];
}
