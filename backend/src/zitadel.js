import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CHANNELS } from './auth.js';

// Login pelo Zitadel (central de identidade Agrosys), ao lado do login local.
// Sem dependencias novas: Authorization Code + PKCE, validacao do JWT (RS256) com node:crypto e publicacao do manifesto
// de permissoes na central. O modo vem de AUTH_MODO: local (padrao) | ambos | zitadel (ver README).
const MODES = ['local', 'zitadel', 'ambos'];
const TEN_MIN = 10 * 60e3;
const safePath = value => (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/dashboard/');
const trimSlash = value => String(value ?? '').replace(/\/+$/, '');

// Chave de role segura (a central aceita letras, numeros, _ e -): "PDV 2" vira "pdv-2".
export const roleSlug = value =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function readZitadelConfig(env = process.env) {
  const mode = String(env.AUTH_MODO ?? 'local').trim().toLowerCase();
  if (!MODES.includes(mode))
    return { mode: 'local', configError: `AUTH_MODO invalido ("${env.AUTH_MODO}"): use ${MODES.join(', ')}. Usando "local".` };
  if (mode === 'local') return { mode };
  const appId = env.ZITADEL_APP_ID ?? 'atualizador';
  let file = {};
  if (env.ZITADEL_CREDENCIAIS) {
    try {
      const json = JSON.parse(fs.readFileSync(env.ZITADEL_CREDENCIAIS, 'utf8'));
      file = { projectId: json.projetoId, ...(json.apps?.[appId] ?? {}) };
    } catch (error) {
      return { mode: 'local', configError: `Nao consegui ler ZITADEL_CREDENCIAIS (${error.message}). Usando AUTH_MODO=local.` };
    }
  }
  // credenciais guardadas pelo registro automatico (primeiro boot com ZITADEL_REGISTRO_TOKEN); ficam junto da chave de assinatura (volume de dados)
  const credentialsFile =
    env.ZITADEL_APP_CREDENCIAIS ??
    path.join(path.dirname(path.resolve(env.PACKAGE_SIGNING_KEY_PATH || './data/package-signing-key.pem')), 'zitadel-app.json');
  try {
    file = { ...JSON.parse(fs.readFileSync(credentialsFile, 'utf8')), ...file };
  } catch {
    /* ainda nao registrado */
  }
  const publicBase = env.PAINEL_PUBLIC_URL ?? env.PUBLIC_URL;
  const config = {
    mode,
    appId,
    credentialsFile,
    registrationToken: env.ZITADEL_REGISTRO_TOKEN,
    rotate: env.ZITADEL_REGISTRO_ROTACIONAR === '1',
    issuer: trimSlash(env.ZITADEL_URL ?? 'http://localhost:8080'),
    projectId: env.ZITADEL_PROJETO_ID ?? file.projectId ?? file.projetoId,
    clientId: env.ZITADEL_CLIENT_ID ?? file.clientId,
    clientSecret: env.ZITADEL_CLIENT_SECRET ?? file.clientSecret,
    serviceUser: env.ZITADEL_SERVICO_USUARIO ?? file.servico?.usuario,
    serviceSecret: env.ZITADEL_SERVICO_SEGREDO ?? file.servico?.segredo,
    centralUrl: trimSlash(env.CENTRAL_URL ?? 'http://localhost:3000'),
    // endereco que o navegador usa para chegar na API (em dev, o painel Next encaminha /api para a 3333).
    // Sem PAINEL_PUBLIC_URL, vale o endereco da propria requisicao (precisa estar cadastrado como redirect no Zitadel).
    publicUrl: publicBase ? trimSlash(publicBase) : undefined
  };
  const missing = ['projectId', 'clientId', 'clientSecret'].filter(key => !config[key]);
  if (missing.length) {
    // sem credenciais, mas com token de registro e endereco publico: a API se registra sozinha na central ao subir
    if (config.registrationToken && config.publicUrl) return { ...config, pendingRegistration: true };
    return {
      mode: 'local',
      configError: `AUTH_MODO=${mode} mas faltam ${missing.join(', ')} (ZITADEL_*). Defina-as, ou ZITADEL_REGISTRO_TOKEN + PAINEL_PUBLIC_URL para o registro automatico. Usando "local".`
    };
  }
  return config;
}

// deps: { listProducts(): [{id,code,name}], log(msg) }
export function createZitadel(config, deps) {
  const configured = config.mode !== 'local';
  let ready = configured && !config.pendingRegistration; // com registro pendente, o login Zitadel so liga depois de registrar
  const ep = configured && {
    auth: `${config.issuer}/oauth/v2/authorize`,
    token: `${config.issuer}/oauth/v2/token`,
    jwks: `${config.issuer}/oauth/v2/keys`,
    userinfo: `${config.issuer}/oidc/v1/userinfo`,
    logout: `${config.issuer}/oidc/v1/end_session`
  };
  const scopes = () =>
    ['openid', 'profile', 'email', `urn:zitadel:iam:org:project:id:${config.projectId}:aud`, 'urn:zitadel:iam:org:projects:roles'].join(' ');
  const baseOf = origin => config.publicUrl ?? trimSlash(origin);
  const pending = new Map(); // state -> { verifier, back, redirectUri, created }

  // ---------- validacao do JWT ----------
  let jwks = { keys: new Map(), expires: 0 };
  async function keyFor(kid) {
    if (jwks.expires < Date.now() || !jwks.keys.has(kid)) {
      const response = await fetch(ep.jwks);
      if (!response.ok) throw new Error(`JWKS ${response.status}`);
      const { keys } = await response.json();
      jwks = { keys: new Map(keys.map(k => [k.kid, crypto.createPublicKey({ key: k, format: 'jwk' })])), expires: Date.now() + TEN_MIN };
    }
    const key = jwks.keys.get(kid);
    if (!key) throw new Error('chave de assinatura desconhecida');
    return key;
  }
  async function verifyJwt(token) {
    const [h, p, s] = String(token).split('.');
    if (!h || !p || !s) throw new Error('token malformado');
    const header = JSON.parse(Buffer.from(h, 'base64url').toString());
    if (header.alg !== 'RS256') throw new Error('algoritmo nao aceito');
    if (!crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), await keyFor(header.kid), Buffer.from(s, 'base64url')))
      throw new Error('assinatura invalida');
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
    if (claims.iss !== config.issuer) throw new Error('emissor inesperado');
    if (![].concat(claims.aud ?? []).includes(config.projectId)) throw new Error('audiencia inesperada');
    if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error('token expirado');
    return claims;
  }

  // ---------- roles -> acesso do Atualizador ----------
  // Chaves do app: admin | canal.<test|beta|production> | produto.<codigo-do-produto>
  const appRoles = claims =>
    Object.keys(claims[`urn:zitadel:iam:org:project:${config.projectId}:roles`] ?? {})
      .filter(key => key.startsWith(`${config.appId}:`))
      .map(key => key.slice(config.appId.length + 1));

  async function accessFromRoles(roles, products) {
    const admin = roles.includes('admin');
    return {
      admin,
      channels: CHANNELS.filter(channel => roles.includes(`canal.${channel}`)),
      productIds: products.filter(p => roles.includes(`produto.${roleSlug(p.code)}`)).map(p => p.id)
    };
  }

  // ---------- fluxo de login ----------
  function loginUrl(back, origin) {
    const now = Date.now();
    for (const [key, value] of pending) if (now - value.created > TEN_MIN) pending.delete(key);
    const state = crypto.randomBytes(16).toString('base64url'),
      verifier = crypto.randomBytes(32).toString('base64url');
    const redirectUri = `${baseOf(origin)}/api/v1/auth/zitadel/callback`;
    pending.set(state, { verifier, back: safePath(back), redirectUri, created: now });
    const url = new URL(ep.auth);
    url.search = new URLSearchParams({
      client_id: config.clientId,
      response_type: 'code',
      scope: scopes(),
      redirect_uri: redirectUri,
      state,
      code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256'
    }).toString();
    return url.toString();
  }

  // Troca o code pelo token, valida e devolve { login, name, roles, back, idToken }. Lanca Error com mensagem para o usuario.
  async function finishLogin(code, state) {
    const entry = state && pending.get(state);
    if (state) pending.delete(state);
    if (!code || !entry) throw new Error('Login expirado. Tente entrar de novo.');
    const response = await fetch(ep.token, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: entry.redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code_verifier: entry.verifier
      })
    });
    if (!response.ok) throw new Error('Nao foi possivel concluir o login no Zitadel.');
    const tokens = await response.json();
    let claims;
    try {
      claims = await verifyJwt(tokens.access_token);
    } catch (error) {
      throw new Error(`Token do Zitadel recusado (${error.message}).`);
    }
    let profile = null; // o JWT nao traz nome/e-mail
    try {
      const info = await fetch(ep.userinfo, { headers: { authorization: `Bearer ${tokens.access_token}` } });
      if (info.ok) profile = await info.json();
    } catch {
      /* segue so com o JWT */
    }
    const roles = appRoles(claims);
    if (!roles.length) throw new Error('Seu usuario nao tem nenhuma permissao neste painel. Peca acesso a um administrador.');
    const login = String(profile?.preferred_username ?? claims.preferred_username ?? '').split('@')[0].toLowerCase();
    if (!login) throw new Error('O Zitadel nao informou o login do usuario.');
    return { login, name: profile?.name || login, roles, back: entry.back, idToken: tokens.id_token };
  }

  function logoutUrl(idToken, origin) {
    const url = new URL(ep.logout);
    const query = { client_id: config.clientId, post_logout_redirect_uri: `${baseOf(origin)}/` };
    if (idToken) query.id_token_hint = idToken;
    url.search = new URLSearchParams(query).toString();
    return url.toString();
  }

  // ---------- manifesto de permissoes ----------
  async function buildManifest() {
    return {
      permissions: [
        { key: 'admin', descricao: 'Administrador (todos os produtos e canais)' },
        ...CHANNELS.map(channel => ({ key: `canal.${channel}`, descricao: `Canal ${channel}` })),
        ...(await deps.listProducts()).map(p => ({ key: `produto.${roleSlug(p.code)}`, descricao: `Produto ${p.name}` }))
      ]
    };
  }

  async function serviceToken() {
    if (!config.serviceUser || !config.serviceSecret)
      throw new Error('ZITADEL_SERVICO_USUARIO/ZITADEL_SERVICO_SEGREDO nao configurados');
    const response = await fetch(ep.token, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.serviceUser,
        client_secret: config.serviceSecret,
        scope: scopes()
      })
    });
    if (!response.ok) throw new Error(`token de servico: ${response.status} ${await response.text()}`);
    return (await response.json()).access_token;
  }

  async function syncManifest() {
    if (!ready || !config.serviceUser) return null;
    try {
      const manifest = await buildManifest();
      const response = await fetch(`${config.centralUrl}/apps/${encodeURIComponent(config.appId)}/permissoes`, {
        method: 'PUT',
        headers: { authorization: `Bearer ${await serviceToken()}`, 'content-type': 'application/json' },
        body: JSON.stringify(manifest)
      });
      if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
      const result = await response.json();
      deps.log(
        `Zitadel: ${manifest.permissions.length} permissoes publicadas na central (${result.criadas.length} novas, ${result.atualizadas.length} atualizadas, ${result.obsoletas.length} obsoletas): ${manifest.permissions.map(p => p.key).join(', ')}`
      );
      return result;
    } catch (error) {
      deps.log(`Zitadel: nao consegui sincronizar as permissoes com a central: ${error.message}`);
      return null;
    }
  }
  let timer = null;
  // Chame depois de criar/excluir produto: agrupa varias mudancas numa so chamada.
  const scheduleSync = () => {
    if (!ready) return;
    clearTimeout(timer);
    timer = setTimeout(syncManifest, 2000);
    timer.unref?.();
  };

  // ---------- usuarios do Agrosys: ler e gravar permissoes pela central ----------
  async function central(method, pathname, body) {
    const response = await fetch(`${config.centralUrl}${pathname}`, {
      method,
      headers: { authorization: `Bearer ${await serviceToken()}`, 'content-type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    if (!response.ok) {
      const message = json && json.message ? [].concat(json.message).join(' ') : `A central respondeu ${response.status}`;
      throw Object.assign(new Error(message), { status: response.status === 404 ? 400 : 502 });
    }
    return json;
  }

  // Acesso do painel (admin / produtos / canais) -> chaves de role do app. Administrador = so "admin".
  function rolesOfAccess(access, products) {
    if (access.role === 'admin') return ['admin'];
    return [
      ...CHANNELS.filter(channel => access.channels.includes(channel)).map(channel => `canal.${channel}`),
      ...products.filter(p => access.productIds.includes(p.id)).map(p => `produto.${roleSlug(p.code)}`)
    ];
  }

  // Pessoas cadastradas no Agrosys e o que cada uma tem NESTE servico, no formato do painel.
  async function listUsers() {
    const [list, products] = await Promise.all([central('GET', `/apps/${encodeURIComponent(config.appId)}/usuarios`), deps.listProducts()]);
    return Promise.all(
      list.map(async u => {
        const roles = u.permissoes ?? [];
        const access = await accessFromRoles(roles, products);
        return {
          id: u.id,
          name: u.nome || u.usuario,
          username: u.usuario,
          email: u.email,
          active: u.ativo,
          login: String(u.usuario ?? '').split('@')[0].toLowerCase(),
          role: access.admin ? 'admin' : 'operator',
          productIds: access.productIds,
          channels: access.channels,
          products: products.filter(p => access.productIds.includes(p.id)).map(p => p.name)
        };
      })
    );
  }

  // Grava (substitui) as permissoes da pessoa neste servico. A central so mexe nas roles deste app.
  async function setUserAccess(userId, access) {
    const roles = rolesOfAccess(access, await deps.listProducts());
    return central('PUT', `/apps/${encodeURIComponent(config.appId)}/usuarios/${encodeURIComponent(userId)}/permissoes`, { permissoes: roles });
  }

  // Registro automatico: pede a central o app OIDC e o usuario de maquina deste servico e guarda as credenciais em arquivo.
  async function register() {
    if (!configured || ready) return ready;
    try {
      const response = await fetch(`${config.centralUrl}/apps/registrar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-registro-token': config.registrationToken },
        body: JSON.stringify({ appId: config.appId, urlPublica: config.publicUrl, callbackPath: '/api/v1/auth/zitadel/callback', rotacionar: config.rotate })
      });
      if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
      const data = await response.json();
      if (!data.clientSecret || !data.servico)
        throw new Error('o app ja esta registrado na central e este servidor nao tem as credenciais guardadas: suba uma vez com ZITADEL_REGISTRO_ROTACIONAR=1 para gerar novas');
      Object.assign(config, {
        projectId: data.projetoId,
        clientId: data.clientId,
        clientSecret: data.clientSecret,
        serviceUser: data.servico.usuario,
        serviceSecret: data.servico.segredo
      });
      fs.mkdirSync(path.dirname(config.credentialsFile), { recursive: true });
      fs.writeFileSync(
        config.credentialsFile,
        JSON.stringify({ projetoId: data.projetoId, clientId: data.clientId, clientSecret: data.clientSecret, servico: data.servico }, null, 2),
        { mode: 0o600 }
      );
      ready = true;
      deps.log(`Zitadel: servico registrado na central (${config.appId}); credenciais em ${config.credentialsFile}${config.rotate ? ' (remova ZITADEL_REGISTRO_ROTACIONAR do ambiente)' : ''}`);
      await syncManifest();
    } catch (error) {
      deps.log(`Zitadel: registro na central falhou (${error.message}); nova tentativa em 60 s. Enquanto isso so o login local funciona.`);
      const retry = setTimeout(register, 60e3);
      retry.unref?.();
    }
    return ready;
  }

  return {
    get enabled() {
      return ready;
    },
    get configured() {
      return configured;
    },
    mode: config.mode,
    get allowLocal() {
      return config.mode !== 'zitadel' || !ready;
    },
    register,
    listUsers,
    setUserAccess,
    loginUrl,
    finishLogin,
    logoutUrl,
    accessFromRoles,
    buildManifest,
    syncManifest,
    scheduleSync
  };
}

// Disabled stub: o resto do codigo chama zitadel.scheduleSync() sem checar o modo.
export const disabledZitadel = {
  enabled: false,
  configured: false,
  mode: 'local',
  allowLocal: true,
  scheduleSync() {},
  async syncManifest() {
    return null;
  }
};
