// Telas do painel <-> enderecos. O navegador mostra o endereco real (ex.: /hub/clientes/<id>/logs/),
// e o servidor (Nginx em producao, Next em desenvolvimento) entrega o mesmo painel para todos eles.
export const routes = [
  { id: 'home', path: '/dashboard' },
  { id: 'clients', path: '/atualizacao/clientes' },
  { id: 'releases', path: '/atualizacao/versao/liberadas' },
  { id: 'ci', path: '/atualizacao/versao/ci-cd' },
  { id: 'products', path: '/atualizacao/versao/produtos' },
  { id: 'logs-errors', path: '/atualizacao/logs-erros' },
  { id: 'users', path: '/atualizacao/permissao/usuarios' },
  { id: 'tokens', path: '/atualizacao/permissao/token' },
  { id: 'hub-users', path: '/hub/players' },
  { id: 'hub-clients', path: '/hub/clientes' },
  { id: 'hub-cities', path: '/hub/cidades' },
  { id: 'hub-logs', path: '/hub/logs' },
  { id: 'hub-docs', path: '/hub/documentacao' }
];

export const pathOf = id => (routes.find(r => r.id === id)?.path ?? '/dashboard') + '/';

// Endereco -> tela + o que sobra depois dela (ex.: /hub/clientes/123/logs -> hub-clients, ['123', 'logs']).
// Endereco desconhecido cai no inicio.
export function parsePath(pathname = '/dashboard') {
  const clean = '/' + String(pathname).split(/[?#]/)[0].split('/').filter(Boolean).join('/');
  const found = routes
    .filter(r => clean === r.path || clean.startsWith(r.path + '/'))
    .sort((a, b) => b.path.length - a.path.length)[0];
  if (!found) return { view: 'home', rest: [], known: false };
  return {
    view: found.id,
    rest: clean.slice(found.path.length).split('/').filter(Boolean).map(decodeURIComponent),
    known: true
  };
}
