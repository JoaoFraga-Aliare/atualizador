import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startServer } from './helpers/server.js';

// API do Hub falsa: guarda as empresas criadas e confere a chave de servico.
async function fakeHub(t) {
  const tenants = [];
  // checklist de prontidao devolvido pelo Hub falso: ajustado pelos testes
  const state = { prontidao: { itens: [], obrigatorios: 5, faltam: 2 }, logs: [] };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', chunk => (raw += chunk));
    req.on('end', () => {
      const send = (status, body) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (req.headers['x-hub-service-key'] !== 'chave-de-servico-de-teste-123') return send(401, { erro: 'sem chave' });
      if (req.method === 'POST' && req.url === '/v1/tenants') {
        const body = JSON.parse(raw);
        const tenant = { id: `t-${tenants.length + 1}`, nome: body.nome, origem: body.origem };
        tenants.push(tenant);
        return send(201, tenant);
      }
      const del = req.method === 'DELETE' && req.url.match(/^\/v1\/tenants\/([^/]+)$/);
      if (del) {
        const index = tenants.findIndex(x => x.id === del[1]);
        if (del[1] === 't-busy') return send(409, { erro: 'Esta empresa ja teve terminal conectado e nao pode ser excluida.' });
        if (index < 0) return send(404, { erro: 'Empresa nao encontrada.' });
        tenants.splice(index, 1);
        return send(200, { ok: true });
      }
      if (req.url.startsWith('/v1/admin/alertas')) return send(200, { abertos: [{ chave: 'envios:t-1', titulo: 'Casa A: 2 envio(s) parado(s)' }], resolvidos: [] });
      if (req.url.startsWith('/v1/postman/')) return send(200, { recebido: req.url });
      if (req.url.startsWith('/v1/admin/logs/')) {
        state.logs.push(`${req.method} ${req.url}${raw ? ' ' + raw : ''}`);
        return send(200, req.url.endsWith('/notificacoes') ? { itens: [{ id: 7, empresa: 'Casa A', canal: 'terminal->hub', resultado: 'erro', total: 3 }] } : { ok: true });
      }
      if (req.method === 'GET' && req.url === '/v1/resumo')
        return send(200, {
          pdv: { requisicoes: 10, erros: 2 },
          outros: { requisicoes: 3, erros: 1 },
          empresas: [{ id: 't-1', terminais: 2, terminaisHomologacao: 2 }]
        });
      if (req.method === 'GET' && req.url === '/v1/docs')
        return send(200, { contratos: [{ caminho: 'x', campos: [] }], pendentes: [] });
      if (req.method === 'GET' && req.url.endsWith('/prontidao')) return send(200, state.prontidao);
      if (req.method === 'GET' && req.url.startsWith('/v1/cidades'))
        return send(200, { total: 1, itens: [{ codigo: 1 }] });
      if (req.method === 'POST' && req.url === '/v1/cidades/ibge/carregar')
        return send(200, { lidas: 5, novas: 5, alteradas: 0 });
      if (req.method === 'GET' && req.url === '/v1/me') return send(200, { tenants });
      if (req.method === 'GET' && req.url.startsWith('/v1/parametros')) return send(200, [{ campo: 'x' }]);
      if (req.method === 'GET' && req.url.includes('/espelho')) return send(200, { total: 0, itens: [] });
      if (req.url.includes('/certificado')) return send(200, { existe: false });
      if (req.url.includes('/webhooks')) return send(200, { eventos: ['nota'], webhooks: [] });
      if (req.method === 'GET' && req.url.endsWith('/terminals'))
        return send(200, [{ id: 'term-1', nome: 'Caixa 01' }]);
      if (req.method === 'PATCH' && /\/terminals\/[^/]+$/.test(req.url)) return send(200, JSON.parse(raw));
      if (req.method === 'POST' && req.url.endsWith('/terminals')) return send(201, { ...JSON.parse(raw), token: 'tk_x' });
      const match = req.url.match(/^\/v1\/tenants\/([^/]+)$/);
      if (req.method === 'GET' && match) {
        const tenant = tenants.find(x => x.id === match[1]);
        return tenant ? send(200, tenant) : send(404, { erro: 'Empresa nao encontrada.' });
      }
      send(404, { erro: 'nao encontrado' });
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  return { tenants, state, url: `http://127.0.0.1:${server.address().port}` };
}

test('usuarios do Hub: cliente de homologacao, homologacao e isolamento do painel', async t => {
  const hub = await fakeHub(t);
  const api = await startServer(t, { env: { HUB_API_URL: hub.url, HUB_SERVICE_KEY: 'chave-de-servico-de-teste-123' } });
  const admin = await api.login();

  // sem empresa nem vinculo: recusa
  const semEmpresa = await api.post(
    '/api/v1/admin/hub/users',
    { name: 'Dev', username: 'dev1', password: 'senha-dev-123' },
    admin
  );
  assert.equal(semEmpresa.status, 400);
  assert.equal(semEmpresa.body.error, 'company_required');

  const created = await api.post(
    '/api/v1/admin/hub/users',
    {
      name: 'Dev Um',
      username: 'dev1',
      password: 'senha-dev-123',
      company: 'Software House X',
      document: '11222333000181'
    },
    admin
  );
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.deepEqual(
    hub.tenants.map(x => [x.nome, x.origem]),
    [['Software House X', 'api']]
  );

  // o usuario do Hub nao aparece na lista de usuarios do sistema
  const system = await api.json('/api/v1/admin/users', { headers: admin });
  assert.ok(!system.body.some(u => u.username === 'dev1'));

  const list = await api.json('/api/v1/admin/hub/users', { headers: admin });
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].homologated, false);
  assert.equal(list.body[0].homologationTenantId, 't-1');

  // o desenvolvedor entra, ve o proprio perfil e nao administra usuarios
  const dev = await api.login('dev1', 'senha-dev-123');
  const me = await api.json('/api/v1/admin/hub/me', { headers: dev });
  assert.deepEqual([me.body.role, me.body.homologated, me.body.canCreateClient], ['developer', false, false]);
  assert.equal((await api.json('/api/v1/admin/hub/users', { headers: dev })).status, 403);
  assert.equal((await api.json('/api/v1/admin/users', { headers: dev })).status, 403);

  // so o administrador homologa
  assert.equal(
    (
      await api.json(`/api/v1/admin/hub/users/${created.body.id}`, {
        method: 'PATCH',
        headers: { ...dev, 'Content-Type': 'application/json' },
        body: JSON.stringify({ homologated: true })
      })
    ).status,
    403
  );
  // o checklist mostra o que falta; liberar incompleto exige confirmacao (force)
  const readiness = await api.json(`/api/v1/admin/hub/users/${created.body.id}/readiness`, { headers: admin });
  assert.deepEqual([readiness.status, readiness.body.faltam], [200, 2]);
  assert.equal((await api.json(`/api/v1/admin/hub/users/${created.body.id}/readiness`, { headers: dev })).status, 403);
  const patch = body =>
    api.json(`/api/v1/admin/hub/users/${created.body.id}`, {
      method: 'PATCH',
      headers: { ...admin, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  const blocked = await patch({ homologated: true });
  assert.deepEqual([blocked.status, blocked.body.error, blocked.body.missing], [409, 'homologation_incomplete', 2]);
  assert.equal((await api.json('/api/v1/admin/hub/me', { headers: dev })).body.canCreateClient, false);
  const approve = await patch({ homologated: true, force: true });
  assert.equal(approve.status, 200);
  const listed = await api.json('/api/v1/admin/hub/users', { headers: admin });
  assert.equal(listed.body[0].approvedMissing, 2);
  // revogar e liberar de novo com tudo pronto: nao precisa de confirmacao
  assert.equal((await patch({ homologated: false })).status, 200);
  hub.state.prontidao.faltam = 0;
  assert.equal((await patch({ homologated: true })).status, 200);
  assert.equal((await api.json('/api/v1/admin/hub/users', { headers: admin })).body[0].approvedMissing, 0);
  const after = await api.json('/api/v1/admin/hub/me', { headers: dev });
  assert.equal(after.body.canCreateClient, true);

  // usuario comum do sistema nao tem acesso ao Hub
  await api.post('/api/v1/admin/products', { code: 'pdv', name: 'PDV' }, admin);
  const op = await api.post(
    '/api/v1/admin/users',
    { name: 'Op', username: 'op1', password: 'senha-op-1234', role: 'operator', productIds: [1], channels: ['test'] },
    admin
  );
  assert.equal(op.status, 201, JSON.stringify(op.body));
  const opHeaders = await api.login('op1', 'senha-op-1234');
  assert.equal((await api.json('/api/v1/admin/hub/me', { headers: opHeaders })).status, 403);

  // vinculo a cliente existente: sem criar empresa nova
  const linked = await api.post(
    '/api/v1/admin/hub/users',
    { name: 'Dev Dois', username: 'dev2', password: 'senha-dev-123', tenantId: 't-1' },
    admin
  );
  assert.equal(linked.status, 201, JSON.stringify(linked.body));
  assert.equal(hub.tenants.length, 1);

  // cliente inexistente no Hub: o usuario nao fica criado pela metade
  const bad = await api.post(
    '/api/v1/admin/hub/users',
    { name: 'Dev Tres', username: 'dev3', password: 'senha-dev-123', tenantId: 'nao-existe' },
    admin
  );
  assert.equal(bad.status, 404);
  assert.equal(
    (await api.json('/api/v1/admin/hub/users', { headers: admin })).body.some(u => u.username === 'dev3'),
    false
  );
});

test('clientes do Hub: visibilidade, homologacao para cadastrar e rotas permitidas', async t => {
  const hub = await fakeHub(t);
  hub.state.prontidao.faltam = 0;
  const api = await startServer(t, { env: { HUB_API_URL: hub.url, HUB_SERVICE_KEY: 'chave-de-servico-de-teste-123' } });
  const admin = await api.login();
  const json = { 'Content-Type': 'application/json' };
  const created = await api.post(
    '/api/v1/admin/hub/users',
    { name: 'Dev', username: 'dev1', password: 'senha-dev-123', company: 'Casa A', document: '11222333000181' },
    admin
  );
  await api.post(
    '/api/v1/admin/hub/users',
    { name: 'Outro', username: 'dev2', password: 'senha-dev-123', company: 'Casa B', document: '11222333000181' },
    admin
  );
  const dev = await api.login('dev1', 'senha-dev-123');

  // cada desenvolvedor ve so o proprio cliente; o administrador ve todos
  const mine = await api.json('/api/v1/admin/hub/tenants', { headers: dev });
  assert.deepEqual(
    mine.body.map(x => [x.nome, x.homologation]),
    [['Casa A', true]]
  );
  assert.equal((await api.json('/api/v1/admin/hub/tenants', { headers: admin })).body.length, 2);

  // rotas do proprio cliente passam; as de outro cliente e as fora da lista nao
  assert.equal(
    (await api.json('/api/v1/admin/hub/proxy/tenants/t-1/terminals', { headers: dev })).body[0].nome,
    'Caixa 01'
  );
  assert.equal((await api.json('/api/v1/admin/hub/proxy/tenants/t-2/terminals', { headers: dev })).status, 403);
  // cliente de homologacao: marcado na lista (com o dono, para o administrador) e so aceita terminal de homologacao
  const adminList = (await api.json('/api/v1/admin/hub/tenants', { headers: admin })).body;
  assert.deepEqual(
    adminList.map(x => [x.nome, x.homologation, x.homologationOwner]),
    [
      ['Casa A', true, 'Dev'],
      ['Casa B', true, 'Outro']
    ]
  );
  assert.deepEqual(
    (await api.json('/api/v1/admin/hub/proxy/tenants/t-1', { headers: dev })).body.homologation,
    true
  );
  const newTerminal = (headers, ambiente) =>
    api.json('/api/v1/admin/hub/proxy/tenants/t-1/terminals', {
      method: 'POST',
      headers: { ...headers, ...json },
      body: JSON.stringify({ nome: 'Caixa 02', ambiente })
    });
  assert.equal((await newTerminal(dev, 'producao')).body.ambiente, 'homologacao');
  assert.equal((await newTerminal(admin, undefined)).body.ambiente, 'homologacao');
  // editar terminal: o cliente de homologacao tambem nunca vai para producao
  const editTerminal = (headers, body) =>
    api.json('/api/v1/admin/hub/proxy/tenants/t-1/terminals/term-1', { method: 'PATCH', headers: { ...headers, ...json }, body: JSON.stringify(body) });
  assert.equal((await editTerminal(dev, { ambiente: 'producao', nome: 'Caixa' })).body.ambiente, 'homologacao');
  assert.equal((await editTerminal(admin, { ambiente: 'producao' })).body.ambiente, 'homologacao');
  assert.equal((await editTerminal(dev, { nome: 'Novo nome' })).body.ambiente, undefined, 'sem ambiente no pedido, nada e inventado');
  assert.equal((await api.json('/api/v1/admin/hub/proxy/tenants/t-2/terminals/term-1', { method: 'PATCH', headers: { ...dev, ...json }, body: '{}' })).status, 403);
  // certificado: so do proprio cliente
  assert.equal((await api.json('/api/v1/admin/hub/proxy/tenants/t-1/certificado', { headers: dev })).status, 200);
  assert.equal(
    (await api.json('/api/v1/admin/hub/proxy/tenants/t-2/certificado/acessos', { headers: dev })).status,
    403
  );
  // webhooks: so do proprio cliente
  assert.equal((await api.json('/api/v1/admin/hub/proxy/tenants/t-1/webhooks', { headers: dev })).status, 200);
  assert.equal((await api.json('/api/v1/admin/hub/proxy/tenants/t-2/webhooks', { headers: dev })).status, 403);
  assert.equal((await api.json('/api/v1/admin/hub/proxy/tenants/t-1/webhooks/nao-e-id', { headers: dev })).status, 404);
  // espelho dos dados sincronizados: so do proprio cliente
  assert.equal(
    (await api.json('/api/v1/admin/hub/proxy/tenants/t-1/espelho/brands?busca=x', { headers: dev })).status,
    200
  );
  assert.equal((await api.json('/api/v1/admin/hub/proxy/tenants/t-2/espelho', { headers: dev })).status, 403);
  assert.equal((await api.json('/api/v1/admin/hub/proxy/tenants/t-1/qualquer', { headers: dev })).status, 404);
  assert.equal((await api.json('/api/v1/admin/hub/proxy/parametros?origem=api', { headers: dev })).status, 200);

  // o desenvolvedor ve o proprio checklist (o admin nao tem: n/a)
  const mine1 = await api.json('/api/v1/admin/hub/me/readiness', { headers: dev });
  assert.deepEqual(
    [mine1.status, mine1.body.applicable, mine1.body.homologated, mine1.body.faltam],
    [200, true, false, 0]
  );
  assert.equal((await api.json('/api/v1/admin/hub/me/readiness', { headers: admin })).body.applicable, false);

  // sem homologacao nao cadastra cliente
  const novo = { nome: 'Cliente Novo', origem: 'api' };
  const before = await api.json('/api/v1/admin/hub/tenants', {
    method: 'POST',
    headers: { ...dev, ...json },
    body: JSON.stringify(novo)
  });
  assert.equal(before.status, 403);
  assert.equal(before.body.error, 'homologation_required');
  await api.json(`/api/v1/admin/hub/users/${created.body.id}`, {
    method: 'PATCH',
    headers: { ...admin, ...json },
    body: JSON.stringify({ homologated: true })
  });
  const after = await api.json('/api/v1/admin/hub/tenants', {
    method: 'POST',
    headers: { ...dev, ...json },
    body: JSON.stringify(novo)
  });
  assert.equal(after.status, 201, JSON.stringify(after.body));
  // o cliente criado passa a ser do desenvolvedor
  assert.deepEqual(
    (await api.json('/api/v1/admin/hub/tenants', { headers: dev })).body.map(x => x.nome),
    ['Casa A', 'Cliente Novo']
  );

  // excluir cliente: o de homologacao e protegido; o do desenvolvedor sai (e o vinculo some); o de outro, nao
  const remove = (id, headers) =>
    api.json(`/api/v1/admin/hub/proxy/tenants/${id}`, { method: 'DELETE', headers });
  assert.equal((await remove('t-1', dev)).body.error, 'homologation_client_protected');
  assert.equal((await remove('t-2', dev)).status, 403);
  assert.equal((await remove('t-3', dev)).status, 200);
  assert.deepEqual(
    (await api.json('/api/v1/admin/hub/tenants', { headers: dev })).body.map(x => x.nome),
    ['Casa A']
  );

  // Postman: administrador e player baixam (com o endereco publico do Hub no baseUrl); sem sessao nao
  for (const headers of [admin, dev]) {
    const col = await api.json('/api/v1/admin/hub/postman/collection', { headers });
    assert.equal(col.status, 200);
    assert.ok(col.body.recebido.startsWith('/v1/postman/collection?base=http'), col.body.recebido);
    assert.ok((await api.json('/api/v1/admin/hub/postman/environment', { headers })).body.recebido.includes('/environment?base='));
  }
  assert.equal((await api.json('/api/v1/admin/hub/postman/collection')).status, 401);

  // menu Logs: so o administrador mexe na retencao, limpa e le as notificacoes do Hub
  const logsCall = (method, path, headers, body) =>
    api.json(`/api/v1/admin/hub/logs/${path}`, { method, headers: { ...headers, ...json }, body: body && JSON.stringify(body) });
  assert.equal((await logsCall('GET', 'config', admin)).status, 200);
  assert.equal((await logsCall('PUT', 'config', admin, { diasLog: 30 })).status, 200);
  assert.equal((await logsCall('POST', 'clear', admin, { alvo: 'corpos' })).status, 200);
  assert.equal((await logsCall('GET', 'notifications', admin)).body.itens[0].total, 3);
  // erros globais (a query chega inteira ao Hub) e alertas de monitoramento: so administrador
  assert.equal((await logsCall('GET', 'errors?periodo=7d&resultado=erro&busca=timeout', admin)).status, 200);
  assert.ok(hub.state.logs.includes('GET /v1/admin/logs/erros?periodo=7d&resultado=erro&busca=timeout'), hub.state.logs.join(' | '));
  const hubCall = (method, path, headers, body) => api.json('/api/v1/admin/hub/' + path, { method, headers: { ...headers, ...json }, body: body && JSON.stringify(body) });
  assert.equal((await hubCall('GET', 'alerts', admin)).body.abertos[0].chave, 'envios:t-1');
  assert.equal((await hubCall('POST', 'alerts/check', admin, {})).status, 200);
  for (const [method, path] of [['GET', 'logs/errors'], ['GET', 'alerts'], ['POST', 'alerts/check']])
    assert.equal((await hubCall(method, path, dev, method === 'GET' ? undefined : {})).status, 403, path);
  assert.deepEqual(hub.state.logs.slice(0, 3), ['GET /v1/admin/logs/config', 'PUT /v1/admin/logs/config {"diasLog":30}', 'POST /v1/admin/logs/limpar {"alvo":"corpos"}']);
  for (const [method, path] of [['GET', 'config'], ['PUT', 'config'], ['POST', 'clear'], ['GET', 'notifications']])
    assert.equal((await logsCall(method, path, dev, method === 'GET' ? undefined : {})).status, 403);

  // dashboard do administrador: players, clientes por player (Agrosys a parte) e trafego das ultimas 24 h
  hub.tenants.push({ id: 't-9', nome: 'ERP Agrosys', origem: 'agrosys' });
  const overview = await api.json('/api/v1/admin/hub/overview', { headers: admin });
  assert.equal(overview.status, 200, JSON.stringify(overview.body));
  assert.deepEqual(
    [overview.body.players, overview.body.clients, overview.body.homologationClients, overview.body.terminals],
    [2, 1, 2, 2]
  );
  assert.deepEqual(
    overview.body.byPlayer.map(p => [p.name, p.clients, p.homologation]),
    [
      ['Dev', 0, 1],
      ['Outro', 0, 1],
      ['Player Agrosys', 1, 0]
    ]
  );
  assert.deepEqual(overview.body.last24h, { pdv: { requisicoes: 10, erros: 2 }, others: { requisicoes: 3, erros: 1 } });
  assert.equal((await api.json('/api/v1/admin/hub/overview', { headers: dev })).status, 403);
});

test('documentacao do Hub: administrador e desenvolvedor veem; usuario comum nao', async t => {
  const hub = await fakeHub(t);
  const api = await startServer(t, { env: { HUB_API_URL: hub.url, HUB_SERVICE_KEY: 'chave-de-servico-de-teste-123' } });
  const admin = await api.login();
  await api.post(
    '/api/v1/admin/hub/users',
    { name: 'Dev', username: 'dev1', password: 'senha-dev-123', company: 'Casa A', document: '11222333000181' },
    admin
  );
  const dev = await api.login('dev1', 'senha-dev-123');
  for (const headers of [admin, dev]) {
    const docs = await api.json('/api/v1/admin/hub/docs', { headers });
    assert.equal(docs.status, 200);
    assert.equal(docs.body.contratos[0].caminho, 'x');
    assert.equal(docs.body.base, hub.url);
  }
  await api.post('/api/v1/admin/products', { code: 'pdv', name: 'PDV' }, admin);
  await api.post(
    '/api/v1/admin/users',
    { name: 'Op', username: 'op1', password: 'senha-op-1234', role: 'operator', productIds: [1], channels: ['test'] },
    admin
  );
  const op = await api.login('op1', 'senha-op-1234');
  assert.equal((await api.json('/api/v1/admin/hub/docs', { headers: op })).status, 403);
});

test('usuarios do Hub: CNPJ valido, consulta publica e dados de contato', async t => {
  const hub = await fakeHub(t);
  const lookup = http.createServer((req, res) => {
    const found = req.url === '/11222333000181';
    res.writeHead(found ? 200 : 404, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify(
        found
          ? {
              razao_social: 'CASA A LTDA',
              nome_fantasia: 'Casa A',
              email: 'Contato@casaa.com',
              ddd_telefone_1: '1133334444',
              municipio: 'Sao Paulo',
              uf: 'SP',
              descricao_situacao_cadastral: 'ATIVA'
            }
          : { message: 'nao' }
      )
    );
  });
  await new Promise(resolve => lookup.listen(0, '127.0.0.1', resolve));
  t.after(() => lookup.close());
  const api = await startServer(t, {
    env: {
      HUB_API_URL: hub.url,
      HUB_SERVICE_KEY: 'chave-de-servico-de-teste-123',
      CNPJ_LOOKUP_URL: `http://127.0.0.1:${lookup.address().port}`
    }
  });
  const admin = await api.login();

  const found = await api.json(`/api/v1/admin/hub/cnpj/${encodeURIComponent('11.222.333/0001-81')}`, {
    headers: admin
  });
  assert.equal(found.status, 200, JSON.stringify(found.body));
  assert.deepEqual([found.body.tradeName, found.body.email, found.body.state], ['Casa A', 'contato@casaa.com', 'SP']);
  assert.equal(
    (await api.json('/api/v1/admin/hub/cnpj/11222333000182', { headers: admin })).body.error,
    'invalid_cnpj'
  );
  assert.equal((await api.json('/api/v1/admin/hub/cnpj/45723174000110', { headers: admin })).status, 404);

  const base = { name: 'Dev', username: 'dev1', password: 'senha-dev-123', company: 'Casa A' };
  assert.equal(
    (await api.post('/api/v1/admin/hub/users', { ...base, document: '123' }, admin)).body.error,
    'invalid_cnpj'
  );
  assert.equal(
    (await api.post('/api/v1/admin/hub/users', { ...base, document: '11222333000181', contactEmail: 'x' }, admin)).body
      .error,
    'invalid_contact_email'
  );
  const ok = await api.post(
    '/api/v1/admin/hub/users',
    {
      ...base,
      document: '11.222.333/0001-81',
      contactName: 'Maria',
      contactEmail: 'maria.souza@casas-sul.com.br',
      contactPhone: '(11) 3333-4444'
    },
    admin
  );
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  const [row] = (await api.json('/api/v1/admin/hub/users', { headers: admin })).body;
  assert.deepEqual(
    [row.document, row.company, row.contactName, row.contactEmail, row.contactPhone],
    ['11222333000181', 'Casa A', 'Maria', 'maria.souza@casas-sul.com.br', '(11) 3333-4444']
  );
});

test('cidades do Hub: todos consultam, so o administrador carrega do IBGE', async t => {
  const hub = await fakeHub(t);
  const api = await startServer(t, { env: { HUB_API_URL: hub.url, HUB_SERVICE_KEY: 'chave-de-servico-de-teste-123' } });
  const admin = await api.login();
  await api.post(
    '/api/v1/admin/hub/users',
    { name: 'Dev', username: 'dev1', password: 'senha-dev-123', company: 'Casa A', document: '11222333000181' },
    admin
  );
  const dev = await api.login('dev1', 'senha-dev-123');
  const json = { 'Content-Type': 'application/json' };
  for (const headers of [admin, dev])
    assert.equal((await api.json('/api/v1/admin/hub/proxy/cidades?busca=x', { headers })).body.total, 1);
  const load = headers =>
    api.json('/api/v1/admin/hub/proxy/cidades/ibge/carregar', {
      method: 'POST',
      headers: { ...headers, ...json },
      body: '{}'
    });
  assert.equal((await load(dev)).status, 403);
  assert.equal((await load(admin)).body.lidas, 5);
  const patch = headers =>
    api.json('/api/v1/admin/hub/proxy/cidades/123', { method: 'PATCH', headers: { ...headers, ...json }, body: '{}' });
  assert.equal((await patch(dev)).status, 403);
});
