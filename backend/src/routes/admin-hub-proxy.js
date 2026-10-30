import { HubError } from '../hub-client.js';

// Hub: clientes (empresas) e terminais. O painel repassa so as rotas abaixo (nao e um proxy aberto),
// depois de checar quem e o usuario e se ele pode mexer naquela empresa.
const ROUTES = [
  ['GET', /^\/parametros$/, { open: true }],
  // Cidades: cadastro unico do Hub. Todos consultam; so o administrador carrega do IBGE e edita.
  ['GET', /^\/cidades$/, { open: true }],
  ['POST', /^\/cidades\/ibge\/carregar$/, { open: true, admin: true }],
  ['PATCH', /^\/cidades\/(\d+)$/, { open: true, admin: true }],
  ['GET', /^\/tenants\/([^/]+)$/],
  // Excluir cliente: o Hub so aceita se nenhum terminal chegou a conectar; o de homologacao nunca se exclui
  ['DELETE', /^\/tenants\/([^/]+)$/],
  ['PUT', /^\/tenants\/([^/]+)\/padroes$/],
  ['GET', /^\/tenants\/([^/]+)\/users$/],
  ['POST', /^\/tenants\/([^/]+)\/users$/],
  ['GET', /^\/tenants\/([^/]+)\/terminals$/],
  ['POST', /^\/tenants\/([^/]+)\/terminals$/],
  ['PATCH', /^\/tenants\/([^/]+)\/terminals\/([^/]+)$/],
  ['POST', /^\/tenants\/([^/]+)\/terminals\/([^/]+)\/token$/],
  ['DELETE', /^\/tenants\/([^/]+)\/terminals\/([^/]+)$/],
  ['GET', /^\/tenants\/([^/]+)\/terminals\/([^/]+)\/config$/],
  ['PUT', /^\/tenants\/([^/]+)\/terminals\/([^/]+)\/config$/],
  // Traz do Agrosys os parametros do caixa (PDVCONFIG2): previa (de -> para) e aplicar
  ['POST', /^\/tenants\/([^/]+)\/terminals\/([^/]+)\/config\/agrosys$/],
  ['GET', /^\/tenants\/([^/]+)\/sync-status$/],
  ['POST', /^\/tenants\/([^/]+)\/sync$/],
  ['GET', /^\/tenants\/([^/]+)\/outbox\/resumo$/],
  ['POST', /^\/tenants\/([^/]+)\/outbox\/(\d+)\/reenviar$/],
  ['GET', /^\/tenants\/([^/]+)\/conexao$/],
  ['GET', /^\/tenants\/([^/]+)\/logs$/],
  ['GET', /^\/tenants\/([^/]+)\/logs\/(\d+)$/],
  ['GET', /^\/tenants\/([^/]+)\/espelho$/],
  ['GET', /^\/tenants\/([^/]+)\/espelho\/([^/]+)$/],
  // Webhooks (origem API): enderecos, entregas, teste e segredo
  ['GET', /^\/tenants\/([^/]+)\/webhooks$/],
  ['POST', /^\/tenants\/([^/]+)\/webhooks$/],
  ['GET', /^\/tenants\/([^/]+)\/webhooks\/entregas$/],
  ['GET', /^\/tenants\/([^/]+)\/webhooks\/entregas\/(\d+)$/],
  ['POST', /^\/tenants\/([^/]+)\/webhooks\/entregas\/(\d+)\/reenviar$/],
  ['PATCH', /^\/tenants\/([^/]+)\/webhooks\/([0-9a-f-]{36})$/],
  ['DELETE', /^\/tenants\/([^/]+)\/webhooks\/([0-9a-f-]{36})$/],
  ['POST', /^\/tenants\/([^/]+)\/webhooks\/([0-9a-f-]{36})\/segredo$/],
  ['POST', /^\/tenants\/([^/]+)\/webhooks\/([0-9a-f-]{36})\/testar$/],
  // Certificado digital A1: metadados, envio, remocao e historico (o arquivo nunca volta)
  ['GET', /^\/tenants\/([^/]+)\/certificado$/],
  ['PUT', /^\/tenants\/([^/]+)\/certificado$/],
  ['DELETE', /^\/tenants\/([^/]+)\/certificado$/],
  ['GET', /^\/tenants\/([^/]+)\/certificado\/acessos$/],
  ['GET', /^\/tenants\/([^/]+)\/api-keys$/],
  ['POST', /^\/tenants\/([^/]+)\/api-keys$/],
  ['DELETE', /^\/tenants\/([^/]+)\/api-keys\/([^/]+)$/]
];

export function registerAdminHubProxyRoutes(app, ctx) {
  const { db, adminAuth, hub } = ctx;
  const isAdmin = req => req.user.role === 'admin';
  const hubUser = (req, res, next) =>
    isAdmin(req) || req.user.hub_role ? next() : res.status(403).json({ error: 'hub_access_required' });
  const homologated = req =>
    isAdmin(req) ||
    Boolean(
      db
        .prepare("SELECT 1 FROM hub_user_tenant WHERE user_id=? AND kind='homologation' AND approved_at IS NOT NULL")
        .get(req.user.id)
    );
  const ownsTenant = (req, tenantId) =>
    isAdmin(req) ||
    Boolean(db.prepare('SELECT 1 FROM hub_user_tenant WHERE user_id=? AND tenant_id=?').get(req.user.id, tenantId));

  // Clientes de homologacao (um por desenvolvedor): tenant_id -> nome do desenvolvedor dono.
  const homologationOwners = () =>
    new Map(
      db
        .prepare(
          "SELECT h.tenant_id,u.name FROM hub_user_tenant h JOIN app_user u ON u.id=h.user_id WHERE h.kind='homologation'"
        )
        .all()
        .map(r => [r.tenant_id, r.name])
    );

  const handle = fn => async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e instanceof HubError)
        return res.status(e.status === 401 ? 502 : e.status).json({ error: e.message, detail: e.detail });
      next(e);
    }
  };

  // Empresas que o usuario enxerga: o administrador ve todas; o desenvolvedor, as vinculadas a ele.
  app.get(
    '/api/v1/admin/hub/tenants',
    adminAuth,
    hubUser,
    handle(async (req, res) => {
      const all = (await hub.call('/v1/me')).tenants;
      const mine = isAdmin(req)
        ? null
        : new Map(
            db
              .prepare('SELECT tenant_id,kind FROM hub_user_tenant WHERE user_id=?')
              .all(req.user.id)
              .map(r => [r.tenant_id, r.kind])
          );
      const owners = homologationOwners();
      res.json(
        all
          .filter(t => !mine || mine.has(t.id))
          .map(t => ({
            id: t.id,
            nome: t.nome,
            origem: t.origem,
            homologation: owners.has(t.id),
            homologationOwner: owners.get(t.id) ?? null
          }))
      );
    })
  );

  // Novo cliente: so administrador ou desenvolvedor ja homologado. O desenvolvedor fica vinculado a ele.
  app.post(
    '/api/v1/admin/hub/tenants',
    adminAuth,
    hubUser,
    handle(async (req, res) => {
      if (!homologated(req)) return res.status(403).json({ error: 'homologation_required' });
      const created = await hub.call('/v1/tenants', { method: 'POST', body: req.body });
      if (!isAdmin(req))
        db.prepare("INSERT INTO hub_user_tenant(user_id,tenant_id,kind) VALUES(?,?,'client')").run(
          req.user.id,
          created.id
        );
      res.status(201).json(created);
    })
  );

  app.all(
    '/api/v1/admin/hub/proxy/*',
    adminAuth,
    hubUser,
    handle(async (req, res) => {
      const path = '/' + req.params[0];
      const route = ROUTES.find(([method, pattern]) => method === req.method && pattern.test(path));
      if (!route) return res.status(404).json({ error: 'not_found' });
      const [, pattern, options] = route;
      if (options?.admin && !isAdmin(req)) return res.status(403).json({ error: 'admin_required' });
      const tenantId = options?.open ? null : decodeURIComponent(path.match(pattern)[1]);
      if (tenantId && !ownsTenant(req, tenantId)) return res.status(403).json({ error: 'tenant_forbidden' });
      const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
      const hasBody = !['GET', 'DELETE'].includes(req.method);
      if (req.method === 'DELETE' && /^\/tenants\/[^/]+$/.test(path) && homologationOwners().has(tenantId))
        return res.status(409).json({ error: 'homologation_client_protected' });
      let body = hasBody ? (req.body ?? {}) : undefined;
      // Cliente de homologacao so tem terminais de homologacao, qualquer que seja o pedido.
      if (req.method === 'POST' && /^\/tenants\/[^/]+\/terminals$/.test(path) && homologationOwners().has(tenantId))
        body = { ...body, ambiente: 'homologacao' };
      // idem ao editar: terminal de cliente de homologacao nunca vai para producao
      if (req.method === 'PATCH' && /^\/tenants\/[^/]+\/terminals\/[^/]+$/.test(path) && homologationOwners().has(tenantId) && body?.ambiente)
        body = { ...body, ambiente: 'homologacao' };
      const result = await hub.call(`/v1${path}${query}`, { method: req.method, body });
      if (req.method === 'DELETE' && /^\/tenants\/[^/]+$/.test(path))
        db.prepare('DELETE FROM hub_user_tenant WHERE tenant_id=?').run(tenantId);
      if (req.method === 'GET' && /^\/tenants\/[^/]+$/.test(path)) {
        const owner = homologationOwners().get(tenantId);
        return res.json({ ...result, homologation: owner !== undefined, homologationOwner: owner ?? null });
      }
      res.json(result);
    })
  );
}
