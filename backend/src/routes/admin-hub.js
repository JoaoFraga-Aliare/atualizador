import { hashPassword } from '../auth.js';
import { HubError } from '../hub-client.js';
import { lookupCnpj, onlyDigits, validCnpj } from '../lib/cnpj.js';

// Hub: usuarios (desenvolvedores) e a homologacao deles.
// Cada desenvolvedor novo ganha um cliente (empresa) de homologacao no Hub; so depois de
// homologado pelo administrador ele pode cadastrar clientes de verdade.
export function registerAdminHubRoutes(app, ctx) {
  const { db, sessions, adminAuth, hub } = ctx;
  const isAdmin = req => req.user.role === 'admin';
  const adminOnly = (req, res, next) => (isAdmin(req) ? next() : res.status(403).json({ error: 'admin_required' }));
  const hubUser = (req, res, next) =>
    isAdmin(req) || req.user.hub_role ? next() : res.status(403).json({ error: 'hub_access_required' });

  const handle = fn => async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e instanceof HubError)
        return res.status(e.status === 401 ? 502 : e.status).json({ error: e.message, detail: e.detail });
      next(e);
    }
  };

  // Perfil no Hub do usuario logado: define o menu e o que ele pode fazer.
  app.get('/api/v1/admin/hub/me', adminAuth, hubUser, (req, res) => {
    const admin = isAdmin(req);
    const approved = admin
      ? true
      : Boolean(
          db
            .prepare(
              "SELECT 1 FROM hub_user_tenant WHERE user_id=? AND kind='homologation' AND approved_at IS NOT NULL"
            )
            .get(req.user.id)
        );
    res.json({
      role: admin ? 'admin' : 'developer',
      homologated: approved,
      canCreateClient: approved,
      canSeeDocs: true,
      configured: hub.configured
    });
  });

  // Resumo do Hub para o dashboard do administrador: players, clientes por player e trafego das ultimas 24 h.
  // Player = desenvolvedor (usuario do Hub). Clientes de origem Agrosys sao do "Player Agrosys"; os de origem API
  // pertencem ao player que os cadastrou (os sem dono entram em "Sem player"). Homologacao fica de fora da conta.
  app.get(
    '/api/v1/admin/hub/overview',
    adminAuth,
    adminOnly,
    handle(async (_req, res) => {
      const [{ tenants }, summary] = await Promise.all([hub.call('/v1/me'), hub.call('/v1/resumo')]);
      const owners = new Map(
          db
            .prepare(
              `SELECT h.tenant_id,h.user_id,u.name,h.kind FROM hub_user_tenant h JOIN app_user u ON u.id=h.user_id`
            )
            .all()
            .map(r => [r.tenant_id, r])
        ),
        players = db
          .prepare('SELECT id,name,active FROM app_user WHERE hub_role IS NOT NULL ORDER BY name')
          .all()
          .map(p => ({ id: String(p.id), name: p.name, active: Boolean(p.active), clients: 0, homologation: 0 })),
        byId = new Map(players.map(p => [p.id, p])),
        agrosys = { id: 'agrosys', name: 'Player Agrosys', active: true, clients: 0, homologation: 0 },
        none = { id: 'none', name: 'Sem player', active: true, clients: 0, homologation: 0 },
        byTenant = new Map(summary.empresas.map(e => [e.id, e]));
      let homologation = 0,
        terminals = 0,
        terminalsHomologation = 0;
      for (const t of tenants) {
        const link = owners.get(t.id),
          counts = byTenant.get(t.id);
        terminals += counts?.terminais ?? 0;
        terminalsHomologation += counts?.terminaisHomologacao ?? 0;
        if (link?.kind === 'homologation') {
          homologation++;
          const p = byId.get(String(link.user_id));
          if (p) p.homologation++;
          continue;
        }
        const player = t.origem === 'agrosys' ? agrosys : (byId.get(String(link?.user_id)) ?? none);
        player.clients++;
      }
      const list = [...players, agrosys, ...(none.clients ? [none] : [])];
      res.json({
        players: players.length,
        clients: tenants.length - homologation,
        homologationClients: homologation,
        terminals,
        terminalsHomologation,
        byPlayer: list,
        last24h: { pdv: summary.pdv, others: summary.outros }
      });
    })
  );

  // Postman: a collection e o ambiente sao montados pelo Hub a partir dos contratos reais; o painel pede ja com o
  // endereco publico do Hub no baseUrl. Administrador e players (Documentacao).
  const publicBase = () => (process.env.HUB_PUBLIC_URL || process.env.HUB_API_URL || '').replace(/\/$/, '');
  const postman = kind =>
    handle(async (_req, res) => {
      const base = publicBase();
      res.json(await hub.call(`/v1/postman/${kind}${base ? `?base=${encodeURIComponent(base)}` : ''}`));
    });
  app.get('/api/v1/admin/hub/postman/collection', adminAuth, hubUser, postman('collection'));
  app.get('/api/v1/admin/hub/postman/environment', adminAuth, hubUser, postman('environment'));

  // Menu Hub > Logs (so administrador): retencao do log de requisicoes, limpeza e quais erros geram notificacao.
  const hubLogs = (method, path) =>
    handle(async (req, res) => {
      res.json(await hub.call(path, { method, body: method === 'GET' ? undefined : (req.body ?? {}) }));
    });
  app.get('/api/v1/admin/hub/logs/config', adminAuth, adminOnly, hubLogs('GET', '/v1/admin/logs/config'));
  app.put('/api/v1/admin/hub/logs/config', adminAuth, adminOnly, hubLogs('PUT', '/v1/admin/logs/config'));
  app.post('/api/v1/admin/hub/logs/clear', adminAuth, adminOnly, hubLogs('POST', '/v1/admin/logs/limpar'));
  app.get('/api/v1/admin/hub/logs/notifications', adminAuth, adminOnly, hubLogs('GET', '/v1/admin/logs/notificacoes'));
  // Erros de todos os clientes (filtros pela query) e alertas de monitoramento.
  app.get(
    '/api/v1/admin/hub/logs/errors',
    adminAuth,
    adminOnly,
    handle(async (req, res) => {
      const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
      res.json(await hub.call(`/v1/admin/logs/erros${query}`));
    })
  );
  app.get('/api/v1/admin/hub/alerts', adminAuth, adminOnly, hubLogs('GET', '/v1/admin/alertas'));
  app.post('/api/v1/admin/hub/alerts/check', adminAuth, adminOnly, hubLogs('POST', '/v1/admin/alertas/avaliar'));

  // Documentacao da API publica do Hub (contratos): administrador e desenvolvedores.
  // `base` e o endereco que aparece nos exemplos: HUB_PUBLIC_URL, senao HUB_API_URL.
  app.get(
    '/api/v1/admin/hub/docs',
    adminAuth,
    hubUser,
    handle(async (_req, res) => {
      const docs = await hub.call('/v1/docs');
      res.json({ ...docs, base: (process.env.HUB_PUBLIC_URL || process.env.HUB_API_URL || '').replace(/\/$/, '') });
    })
  );

  // Consulta publica de CNPJ (preenche empresa e contato no cadastro do desenvolvedor).
  app.get('/api/v1/admin/hub/cnpj/:cnpj', adminAuth, adminOnly, async (req, res) => {
    if (!validCnpj(req.params.cnpj)) return res.status(400).json({ error: 'invalid_cnpj' });
    const result = await lookupCnpj(req.params.cnpj);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(result.data);
  });

  app.get('/api/v1/admin/hub/users', adminAuth, adminOnly, (_req, res) => {
    const rows = db
      .prepare(
        `SELECT u.id,u.username,u.name,u.hub_role role,u.active,u.created_at createdAt,
                h.tenant_id homologationTenantId,h.approved_at approvedAt,h.approved_missing approvedMissing,
                p.document,p.company,p.contact_name contactName,p.contact_email contactEmail,p.contact_phone contactPhone,
                (SELECT COUNT(*) FROM hub_user_tenant c WHERE c.user_id=u.id AND c.kind='client') clients
           FROM app_user u LEFT JOIN hub_user_tenant h ON h.user_id=u.id AND h.kind='homologation'
                LEFT JOIN hub_user_profile p ON p.user_id=u.id
          WHERE u.hub_role IS NOT NULL ORDER BY u.name`
      )
      .all();
    res.json(rows.map(r => ({ ...r, homologated: Boolean(r.approvedAt) })));
  });

  app.post(
    '/api/v1/admin/hub/users',
    adminAuth,
    adminOnly,
    handle(async (req, res) => {
      const name = String(req.body.name || '').trim(),
        username = String(req.body.username || '').trim(),
        company = String(req.body.company || '').trim(),
        tenantId = String(req.body.tenantId || '').trim(),
        document = onlyDigits(req.body.document),
        contactName = String(req.body.contactName || '').trim(),
        contactEmail = String(req.body.contactEmail || '').trim(),
        contactPhone = String(req.body.contactPhone || '').trim();
      if (!name || !username) return res.status(400).json({ error: 'name_and_username_required' });
      // Sem vinculo a um cliente existente, a empresa e obrigatoria: vira o cliente de homologacao.
      if (!tenantId && company.length < 2) return res.status(400).json({ error: 'company_required' });
      if (!tenantId && !validCnpj(document)) return res.status(400).json({ error: 'invalid_cnpj' });
      if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))
        return res.status(400).json({ error: 'invalid_contact_email' });
      let passwordHash;
      try {
        passwordHash = hashPassword(req.body.password);
      } catch {
        return res.status(400).json({ error: 'password_too_short' });
      }
      if (db.prepare('SELECT 1 FROM app_user WHERE username=?').get(username))
        return res.status(409).json({ error: 'username_taken' });
      const userId = Number(
        db
          .prepare(
            "INSERT INTO app_user(username,name,password_hash,role,hub_role) VALUES(?,?,?,'operator','developer')"
          )
          .run(username, name, passwordHash).lastInsertRowid
      );
      try {
        db.prepare(
          'INSERT INTO hub_user_profile(user_id,document,company,contact_name,contact_email,contact_phone) VALUES(?,?,?,?,?,?)'
        ).run(
          userId,
          document || null,
          company || null,
          contactName || null,
          contactEmail || null,
          contactPhone || null
        );
        if (tenantId) {
          await hub.call(`/v1/tenants/${encodeURIComponent(tenantId)}`);
          db.prepare("INSERT INTO hub_user_tenant(user_id,tenant_id,kind) VALUES(?,?,'client')").run(userId, tenantId);
        } else {
          const tenant = await hub.call('/v1/tenants', {
            method: 'POST',
            body: { nome: company, documento: document, origem: 'api' }
          });
          db.prepare("INSERT INTO hub_user_tenant(user_id,tenant_id,kind) VALUES(?,?,'homologation')").run(
            userId,
            tenant.id
          );
        }
      } catch (e) {
        db.prepare('DELETE FROM app_user WHERE id=?').run(userId);
        throw e;
      }
      res.status(201).json({ id: userId });
    })
  );

  // Checklist do que o PDV exige x o que o cliente de homologacao ja tem (criterio para homologar).
  const readiness = async userId => {
    const link = db
      .prepare("SELECT tenant_id FROM hub_user_tenant WHERE user_id=? AND kind='homologation'")
      .get(userId);
    if (!link) return null;
    return hub.call(`/v1/tenants/${encodeURIComponent(link.tenant_id)}/prontidao`);
  };
  // O proprio desenvolvedor ve o checklist da homologacao dele: o que o PDV exige, o que ja esta apto e o que falta.
  app.get(
    '/api/v1/admin/hub/me/readiness',
    adminAuth,
    hubUser,
    handle(async (req, res) => {
      if (isAdmin(req)) return res.json({ applicable: false });
      const result = await readiness(req.user.id);
      if (!result) return res.json({ applicable: false });
      const row = db
        .prepare("SELECT approved_at,approved_missing FROM hub_user_tenant WHERE user_id=? AND kind='homologation'")
        .get(req.user.id);
      res.json({
        applicable: true,
        homologated: Boolean(row.approved_at),
        approvedMissing: row.approved_missing,
        ...result
      });
    })
  );

  app.get(
    '/api/v1/admin/hub/users/:id/readiness',
    adminAuth,
    adminOnly,
    handle(async (req, res) => {
      const user = db.prepare('SELECT id FROM app_user WHERE id=? AND hub_role IS NOT NULL').get(Number(req.params.id));
      if (!user) return res.status(404).json({ error: 'user_not_found' });
      const result = await readiness(user.id);
      if (!result) return res.status(409).json({ error: 'no_homologation_client' });
      res.json(result);
    })
  );

  // Homologar (ou revogar) e ativar/desativar o desenvolvedor.
  // Liberar com itens obrigatorios faltando exige confirmacao explicita (force).
  app.patch(
    '/api/v1/admin/hub/users/:id',
    adminAuth,
    adminOnly,
    handle(async (req, res) => {
      const id = Number(req.params.id);
      const user = db.prepare('SELECT id FROM app_user WHERE id=? AND hub_role IS NOT NULL').get(id);
      if (!user) return res.status(404).json({ error: 'user_not_found' });
      let missing = null;
      if (req.body.homologated === true) {
        const result = await readiness(id);
        if (!result) return res.status(409).json({ error: 'no_homologation_client' });
        missing = result.faltam;
        if (missing > 0 && req.body.force !== true)
          return res.status(409).json({ error: 'homologation_incomplete', missing, required: result.obrigatorios });
      }
      db.transaction(() => {
        if (typeof req.body.homologated === 'boolean') {
          const r = db
            .prepare(
              "UPDATE hub_user_tenant SET approved_at=?,approved_by=?,approved_missing=? WHERE user_id=? AND kind='homologation'"
            )
            .run(
              req.body.homologated ? new Date().toISOString() : null,
              req.body.homologated ? req.user.id : null,
              req.body.homologated ? missing : null,
              id
            );
          if (!r.changes) throw Object.assign(new Error('no_homologation_client'), { status: 409 });
        }
        if (typeof req.body.active === 'boolean') {
          db.prepare('UPDATE app_user SET active=? WHERE id=?').run(req.body.active ? 1 : 0, id);
          if (!req.body.active) sessions.revokeUser(id);
        }
      })();
      res.json({ updated: true });
    })
  );
}
