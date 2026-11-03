import express, { type NextFunction, type Request, type Response } from 'express';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { z, ZodError } from 'zod';
import {
  entidades, loteIngestao, origens, padroesAgrosysObrigatorios,
  parametros, validarParametros, canonico, type Origem,
  contratos, emDefinicao, entidadesComuns, ehComum, schemaExterno, schemaParcial, chaveExterna, paraLegado, paraExterno, chaveDaLinha, type Contrato,
} from '@hub/contracts';
import { ErroProvider, ErroSoap, linhasDaEntidade, operacoesTempoReal, tiposEnvio } from '@hub/providers';
import { ingerir, entidadePorNome } from './ingestao.js';
import { EmpresaNaoEncontrada, provedorDaEmpresa } from './provedor.js';
import { sincronizarEmpresa } from './sync-agrosys.js';
import { despachar, type LinhaOutbox } from './envios.js';
import { logRequisicoes } from './log.js';
import { cabecalhosSeguros, criarLimitadores, lerLimites, origemTeste } from './seguranca.js';
import { configAlertas, errosGlobais, gravarConfig, lerConfig, limpar, notificacoes } from './logs-admin.js';
import { avaliarAlertas, listarAlertas } from './monitoramento.js';
import { montarAmbiente, montarColecao } from './postman.js';
import { CRITERIOS, ORDEM_DE_CARGA, calcularProntidao } from './prontidao.js';
import { corpoTerminal, paraContrato, paraValores, EMPRESA, FISCAL } from './terminais-api.js';
import { ErroCertificado, analisarPfx, cifrarCertificado, decifrarCertificado, diasRestantes, mesmaRaizCnpj } from './certificados.js';
import { OPERACAO_CONFIG, baixarCertificado, traduzirPdvConfig2 } from './config-agrosys.js';
import { carregarIbge, linhaDoTerminal, visao as visaoCidade } from './cidades.js';
import { EVENTOS, cifrar, enfileirar, entregar, novoSegredo, prefixoDoSegredo, processarEntregas, validarUrl, type Envelope, type Evento } from './webhooks.js';
import type { Db } from './db.js';
import { confereSenha, hashSenha } from './senha.js';
import { emitirUsuario, verificar, type TokenUsuario } from './tokens.js';

type Ctx = { db: Db; segredo: string; chaveServico?: string };

class HttpErro extends Error {
  constructor(public status: number, mensagem: string, public detalhe?: unknown) { super(mensagem); }
}

const h = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

const PREFIXO_TOKEN = 'tk_';
const novoToken = () => PREFIXO_TOKEN + randomBytes(32).toString('base64url');
const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
const prefixoVisivel = (t: string) => t.slice(0, PREFIXO_TOKEN.length + 6);

const pid = (req: Request, nome: string): string => String(req.params[nome]);

let hashFalsoCache: Promise<string> | undefined;
const hashFalso = () => (hashFalsoCache ??= hashSenha(randomBytes(16).toString('hex')));

export function criarApp({ db, segredo, chaveServico }: Ctx) {
  const segredoApp = segredo;
  const app = express();
  app.disable('x-powered-by');
  // Atras de um proxy reverso (Nginx), defina HUB_TRUST_PROXY=1 para o limite de taxa enxergar o IP real do cliente.
  if (process.env.HUB_TRUST_PROXY) app.set('trust proxy', Number(process.env.HUB_TRUST_PROXY) || process.env.HUB_TRUST_PROXY);
  const limites = criarLimitadores(lerLimites());
  app.use(cabecalhosSeguros);
  // Referer: postman marca o que a requisicao grava como teste (nao conta na homologacao).
  app.use((req, res, next) => { res.locals.teste = origemTeste(req); next(); });
  app.use(limites.geral);
  // Corpo grande (lotes de cadastro, certificado) so para quem apresenta credencial; anonimo (login) tem limite pequeno.
  const jsonGrande = express.json({ limit: '20mb' });
  const jsonPequeno = express.json({ limit: '64kb' });
  // "Credencial valida" aqui e so existencia/assinatura (sem atualizar uso nem log): Authorization com lixo cai no limite pequeno.
  const credencialValida = async (req: Request): Promise<boolean> => {
    const chaveSvc = req.header('x-hub-service-key') ?? '';
    if (chaveSvc) return !!chaveServico && hashToken(chaveSvc) === hashToken(chaveServico);
    const a = req.header('authorization') ?? '';
    const t = a.startsWith('Bearer ') ? a.slice(7) : '';
    if (!t) return false;
    if (t.startsWith('tk_')) return !!(await db.query('select 1 from terminals where token_hash = $1 and ativo', [hashToken(t)])).rowCount;
    if (t.startsWith('hk_')) return !!(await db.query('select 1 from api_keys where chave_hash = $1', [hashToken(t)])).rowCount;
    try { await verificar(segredo, t); return true; } catch { return false; }
  };
  app.use(async (req, res, next) => {
    const tentaCredencial = !!(req.header('authorization') || req.header('x-hub-service-key'));
    const grande = tentaCredencial && await credencialValida(req).catch(() => false);
    (grande ? jsonGrande : jsonPequeno)(req, res, next);
  });
  // Parametros de caminho com formato fixo: id que nao e UUID (ou numero, nas rotas de numeracao sequencial) e
  // 404 limpo na hora, nunca um erro de conversao do banco (500) nem mais um acesso a ele.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const naoEncontrado = (res: Response) => res.status(404).json({ erro: 'Nao encontrado.' });
  for (const nome of ['id', 'tid', 'wid', 'kid']) {
    app.param(nome, (req, res, next, v: string) => {
      const sequencial = nome === 'id' && String(req.route?.path).startsWith('/v1/terminal/envios/');   // outbox.id e bigint
      return (sequencial ? /^\d{1,15}$/.test(v) : UUID.test(v)) ? next() : naoEncontrado(res);
    });
  }
  for (const nome of ['oid', 'eid', 'logId', 'codigo']) app.param(nome, (_req, res, next, v: string) => (/^\d{1,15}$/.test(v) ? next() : naoEncontrado(res)));
  // Log das rotas de dados (terminal e sistema do cliente); o ping e as leituras do gerencial ficam de fora.
  app.use(logRequisicoes(db));

  // ---- autenticacao -------------------------------------------------------
  const bearer = (req: Request) => {
    const a = req.header('authorization') ?? '';
    return a.startsWith('Bearer ') ? a.slice(7) : '';
  };
  // Chave de servico (Atualizador): equivale a um super usuario do Hub; quem a usa ja autenticou e
  // autorizou o usuario do painel. Comparacao por hash para nao vazar o tamanho/prefixo.
  let superServico: string | undefined;
  const ehServico = (req: Request) => {
    const v = req.header('x-hub-service-key') ?? '';
    return !!chaveServico && v.length > 0 && hashToken(v) === hashToken(chaveServico);
  };
  const usuario = async (req: Request): Promise<TokenUsuario> => {
    if (ehServico(req)) {
      superServico ??= (await db.query('select id from users where is_super and ativo order by criado_em limit 1')).rows[0]?.id;
      if (superServico) return { tipo: 'usuario', sub: superServico, super: true };
      throw new HttpErro(401, 'Nao ha administrador do Hub para a chave de servico.');
    }
    try {
      const t = await verificar(segredo, bearer(req));
      if (t.tipo === 'usuario') {
        // O JWT dura 12h: desativacao e rebaixamento valem na hora, entao ativo e is_super vem do banco, nao do token.
        const r = await db.query('select is_super from users where id = $1 and ativo', [t.sub]);
        if (!r.rowCount) throw new HttpErro(401, 'Nao autenticado.');
        t.super = r.rows[0].is_super === true;
        if (req.res) req.res.locals.log = { ...(req.res.locals.log ?? {}), usuario: t.sub };
        return t;
      }
    } catch { /* cai no erro abaixo */ }
    throw new HttpErro(401, 'Nao autenticado.');
  };
  // Terminal: token opaco gerado no gerencial (tk_...), guardado como hash.
  const terminal = async (req: Request): Promise<{ sub: string; tenant: string }> => {
    const t = bearer(req);
    if (t.startsWith(PREFIXO_TOKEN)) {
      const r = await db.query(
        'select id, tenant_id from terminals where token_hash = $1 and ativo', [hashToken(t)]);
      if (r.rowCount) {
        if (req.res) req.res.locals.log = { ...(req.res.locals.log ?? {}), tenant: r.rows[0].tenant_id, terminal: r.rows[0].id };
        return { sub: r.rows[0].id, tenant: r.rows[0].tenant_id };
      }
    }
    throw new HttpErro(401, 'Terminal nao autenticado.');
  };
  // super: qualquer tenant. Demais: precisam de membership no tenant (e papel, se informado).
  const acessoTenant = async (u: TokenUsuario, tenantId: string, papeis?: string[]) => {
    if (u.super) return;
    const r = await db.query('select papel from memberships where user_id = $1 and tenant_id = $2', [u.sub, tenantId]);
    if (!r.rowCount || (papeis && !papeis.includes(r.rows[0].papel))) throw new HttpErro(403, 'Sem acesso a este tenant.');
  };

  app.get('/health', h(async (_req, res) => { await db.query('select 1'); res.json({ ok: true }); }));

  // ---- login (senha) ------------------------------------------------------
  app.post('/v1/auth/login', h(async (req, res) => {
    const { email, senha } = z.object({ email: z.string().email().max(200), senha: z.string().min(1).max(200) }).parse(req.body);
    const espera = limites.login.bloqueado(req, email);
    if (espera) { limites.bloquear(res, espera, 'Muitas tentativas de login. Aguarde alguns minutos.'); return; }
    const r = await db.query('select id, nome, senha_hash, is_super, ativo from users where lower(email) = lower($1)', [email]);
    const u = r.rows[0];
    // Compara sempre (mesmo sem usuario) para o tempo de resposta nao revelar se o e-mail existe.
    const hashDeComparacao = u?.senha_hash ?? await hashFalso();
    const senhaOk = await confereSenha(senha, hashDeComparacao);
    const ok = !!u && u.ativo && senhaOk;
    if (!ok) { limites.login.falhou(req, email); throw new HttpErro(401, 'E-mail ou senha invalidos.'); }
    limites.login.acertou(req, email);
    res.json({ token: await emitirUsuario(segredo, u.id, u.is_super), usuario: { id: u.id, nome: u.nome, super: u.is_super } });
  }));

  app.get('/v1/me', h(async (req, res) => {
    const u = await usuario(req);
    const r = await db.query('select id, email, nome, is_super from users where id = $1', [u.sub]);
    const t = u.super
      ? await db.query('select id, nome, provider as origem, null as papel from tenants where ativo order by nome')
      : await db.query('select t.id, t.nome, t.provider as origem, m.papel from memberships m join tenants t on t.id = m.tenant_id where m.user_id = $1 and t.ativo order by t.nome', [u.sub]);
    res.json({ usuario: r.rows[0], tenants: t.rows });
  }));

  // Collection do Postman (e ambiente) montadas dos contratos reais; ?base= preenche o baseUrl (o painel manda o endereco publico do Hub).
  const baseDoPostman = (req: Request) => {
    const b = String(req.query.base ?? '').trim().replace(/\/$/, '');
    return /^https?:\/\/[^\s"<>]{1,200}$/i.test(b) ? b : 'http://localhost:4000';
  };
  app.get('/v1/postman/collection', h(async (req, res) => { await usuario(req); res.json(montarColecao(baseDoPostman(req))); }));
  app.get('/v1/postman/environment', h(async (req, res) => { await usuario(req); res.json(montarAmbiente(baseDoPostman(req))); }));

  // ---- menu Logs do administrador: retencao, limpeza e quais erros notificam ------------------------------
  const soSuper = async (req: Request) => { const u = await usuario(req); if (!u.super) throw new HttpErro(403, 'Somente o administrador do Hub.'); return u; };
  app.get('/v1/admin/logs/config', h(async (req, res) => { await soSuper(req); res.json(await lerConfig(db)); }));
  app.put('/v1/admin/logs/config', h(async (req, res) => {
    await soSuper(req);
    const r = await gravarConfig(db, req.body);
    if ('erros' in r) throw new HttpErro(422, 'Configuracao de log invalida.', r.erros);
    res.json(r.config);
  }));
  app.post('/v1/admin/logs/limpar', h(async (req, res) => {
    await soSuper(req);
    const r = await limpar(db, req.body);
    if ('erros' in r) throw new HttpErro(422, 'Pedido de limpeza invalido.', r.erros);
    res.json(r);
  }));
  app.get('/v1/admin/logs/notificacoes', h(async (req, res) => { await soSuper(req); res.json(await notificacoes(db)); }));
  // Erros de todas as empresas numa lista so (detalhe de cada um: GET /v1/tenants/:id/logs/:logId).
  app.get('/v1/admin/logs/erros', h(async (req, res) => {
    await soSuper(req);
    const r = await errosGlobais(db, req.query);
    if ('erros' in r) throw new HttpErro(422, 'Filtro invalido.', r.erros);
    res.json(r);
  }));
  // Alertas de monitoramento: abertos e resolvidos nas ultimas 24 h. "avaliar" recalcula na hora.
  app.get('/v1/admin/alertas', h(async (req, res) => { await soSuper(req); res.json(await listarAlertas(db)); }));
  app.post('/v1/admin/alertas/avaliar', h(async (req, res) => {
    await soSuper(req);
    const r = await avaliarAlertas(db, await configAlertas(db));
    res.json({ total: r.abertos, novos: r.novos.length, resolvidosAgora: r.resolvidos, ...(await listarAlertas(db)) });
  }));

  // Resumo para o painel do administrador: trafego das ultimas 24 h (log de requisicoes) e terminais por
  // empresa. Canal terminal->hub = o PDV; os demais (ERP, sistema do cliente) vem separados.
  app.get('/v1/resumo', h(async (req, res) => {
    const u = await usuario(req);
    if (!u.super) throw new HttpErro(403, 'Somente o administrador do Hub.');
    const trafego = await db.query(
      `select tenant_id, canal, sum(ok + recusados + erros)::int as requisicoes, sum(recusados + erros)::int as erros
         from trafego_hora where hora > date_trunc('hour', now() - interval '24 hours') group by tenant_id, canal`);
    const terminais = await db.query(
      `select tenant_id, count(*)::int as terminais, count(*) filter (where ambiente = 'homologacao')::int as homologacao
         from terminals group by tenant_id`);
    const soma = (canal: string | null, campo: 'requisicoes' | 'erros') =>
      trafego.rows.filter((x) => canal === null || x.canal === canal).reduce((s, x) => s + x[campo], 0);
    res.json({
      pdv: { requisicoes: soma('terminal->hub', 'requisicoes'), erros: soma('terminal->hub', 'erros') },
      outros: { requisicoes: soma(null, 'requisicoes') - soma('terminal->hub', 'requisicoes'), erros: soma(null, 'erros') - soma('terminal->hub', 'erros') },
      empresas: terminais.rows.map((x) => ({
        id: x.tenant_id, terminais: x.terminais, terminaisHomologacao: x.homologacao,
        requisicoes: trafego.rows.filter((y) => y.tenant_id === x.tenant_id && y.canal === 'terminal->hub').reduce((s, y) => s + y.requisicoes, 0),
        erros: trafego.rows.filter((y) => y.tenant_id === x.tenant_id && y.canal === 'terminal->hub').reduce((s, y) => s + y.erros, 0),
      })),
    });
  }));

  // ---- tenants ------------------------------------------------------------
  // Origem da integracao: 'agrosys' (Hub busca no ERP; exige os padroes de
  // conexao) ou 'api' (o sistema do cliente envia pela API).
  const padroesValidos = (origem: Origem, padroes: Record<string, unknown> | undefined, completo: boolean) => {
    const { valores, erros } = validarParametros(padroes ?? {}, origem);
    if (completo && origem === 'agrosys') {
      for (const c of padroesAgrosysObrigatorios) {
        if (valores[c] === undefined || valores[c] === null || valores[c] === '') erros.push({ campo: c, erro: 'obrigatorio para origem agrosys' });
      }
    }
    // padroes so aceitam campos de conexao (os que so existem no Agrosys)
    for (const c of Object.keys(valores)) {
      if (parametros.find((p) => p.campo === c)?.origem !== 'agrosys') { erros.push({ campo: c, erro: 'nao e um padrao de conexao' }); delete valores[c]; }
    }
    if (erros.length) throw new HttpErro(422, 'Dados da origem invalidos.', erros);
    return valores;
  };

  app.post('/v1/tenants', h(async (req, res) => {
    const u = await usuario(req);
    if (!u.super) throw new HttpErro(403, 'Apenas administrador do Hub.');
    const b = z.object({
      nome: z.string().min(2), documento: z.string().optional(),
      origem: z.enum(origens), padroes: z.record(z.unknown()).optional(),
    }).parse(req.body);
    const padroes = b.origem === 'agrosys' ? padroesValidos('agrosys', b.padroes, true) : {};
    const id = randomUUID();
    await db.query('insert into tenants (id, nome, documento, provider, provider_config) values ($1,$2,$3,$4,$5)',
      [id, b.nome, b.documento ?? null, b.origem, JSON.stringify({ padroes })]);
    res.status(201).json({ id, nome: b.nome, origem: b.origem });
  }));

  app.get('/v1/tenants/:id', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'));
    const r = await db.query('select id, nome, documento, provider as origem, provider_config, ativo, criado_em from tenants where id = $1', [pid(req, 'id')]);
    if (!r.rowCount) throw new HttpErro(404, 'Empresa nao encontrada.');
    const { provider_config, ...resto } = r.rows[0];
    res.json({ ...resto, padroes: provider_config?.padroes ?? {} });
  }));

  // Exclui a empresa (e tudo dela: terminais, chaves, dados sincronizados, logs). So se nenhum terminal
  // dela chegou a conectar: depois disso ela tem historico e deve ser desativada, nao apagada.
  app.delete('/v1/tenants/:id', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'), ['tenant_admin']);
    const t = await db.query('select id from tenants where id = $1', [pid(req, 'id')]);
    if (!t.rowCount) throw new HttpErro(404, 'Empresa nao encontrada.');
    const c = await db.query('select count(*)::int as n from terminals where tenant_id = $1 and ultimo_contato is not null', [pid(req, 'id')]);
    if (c.rows[0].n > 0) throw new HttpErro(409, 'Esta empresa ja teve terminal conectado e nao pode ser excluida.');
    await db.query('delete from tenants where id = $1', [pid(req, 'id')]);
    res.json({ ok: true });
  }));

  // Padroes de conexao da empresa (origem agrosys): herdados por todos os terminais.
  app.put('/v1/tenants/:id/padroes', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'), ['tenant_admin']);
    const t = await db.query('select provider, provider_config from tenants where id = $1', [pid(req, 'id')]);
    if (!t.rowCount) throw new HttpErro(404, 'Empresa nao encontrada.');
    if (t.rows[0].provider !== 'agrosys') throw new HttpErro(409, 'Padroes de conexao so existem na origem agrosys.');
    const b = z.object({ padroes: z.record(z.unknown()) }).parse(req.body);
    const novos = { ...(t.rows[0].provider_config?.padroes ?? {}), ...padroesValidos('agrosys', b.padroes, false) };
    padroesValidos('agrosys', novos, true);
    await db.query('update tenants set provider_config = $2, padroes_versao = padroes_versao + 1 where id = $1', [pid(req, 'id'), JSON.stringify({ padroes: novos })]);
    res.json({ padroes: novos });
  }));

  app.get('/v1/tenants/:id/users', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'));
    const r = await db.query(
      `select u.id, u.nome, u.email, m.papel, u.ativo, u.criado_em from memberships m join users u on u.id = m.user_id
        where m.tenant_id = $1 order by u.nome`, [pid(req, 'id')]);
    res.json(r.rows);
  }));

  // Usuario de integracao do cliente: controla os terminais do proprio tenant.
  app.post('/v1/tenants/:id/users', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'), ['tenant_admin']);
    const b = z.object({
      email: z.string().email(), nome: z.string().min(2), senha: z.string().min(10),
      papel: z.enum(['tenant_admin', 'integracao']).default('integracao'),
    }).parse(req.body);
    const id = randomUUID();
    const c = await db.connect();
    try {
      await c.query('begin');
      const ex = await c.query('select id from users where lower(email) = lower($1)', [b.email]);
      if (ex.rowCount) throw new HttpErro(409, 'E-mail ja cadastrado.');
      await c.query('insert into users (id, email, nome, senha_hash) values ($1,$2,$3,$4)', [id, b.email, b.nome, await hashSenha(b.senha)]);
      await c.query('insert into identities (id, user_id, provider, subject) values ($1,$2,$3,$4)', [randomUUID(), id, 'password', b.email.toLowerCase()]);
      await c.query('insert into memberships (user_id, tenant_id, papel) values ($1,$2,$3)', [id, pid(req, 'id'), b.papel]);
      await c.query('commit');
    } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
    res.status(201).json({ id, email: b.email, papel: b.papel });
  }));

  // ---- terminais ----------------------------------------------------------
  // O terminal conecta por token (Authorization: Bearer tk_...). O token aparece
  // uma unica vez ao criar/gerar; no banco fica o hash e um prefixo para identificar.
  app.post('/v1/tenants/:id/terminals', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'), ['tenant_admin', 'integracao']);
    const b = z.object({
      nome: z.string().trim().min(1).max(100), codigoLegado: z.string().max(50).optional(), copiarDe: z.string().uuid().optional(),
      ambiente: z.enum(['producao', 'homologacao']).default('producao'),
    }).parse(req.body);
    // copiarDe: replica os parametros do caixa de outro terminal da mesma empresa (token proprio e novo).
    if (b.copiarDe) await carregarTerminalConfig(pid(req, 'id'), b.copiarDe);
    const id = randomUUID();
    const token = novoToken();
    await db.query(
      `insert into terminals (id, tenant_id, nome, codigo_legado, token_hash, token_prefixo, token_gerado_em, ambiente)
       values ($1,$2,$3,$4,$5,$6, now(), $7)`,
      [id, pid(req, 'id'), b.nome, b.codigoLegado ?? null, hashToken(token), prefixoVisivel(token), b.ambiente]);
    if (b.copiarDe) {
      await db.query(
        `insert into terminal_settings (terminal_id, valores, versao, atualizado_por)
         select $1, valores, 1, $2 from terminal_settings where terminal_id = $3`,
        [id, u.sub, b.copiarDe]);
    }
    res.status(201).json({ id, nome: b.nome, ambiente: b.ambiente, token });
  }));

  app.get('/v1/tenants/:id/terminals', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'));
    const r = await db.query(
      'select id, nome, codigo_legado, ambiente, ativo, ultimo_contato, token_prefixo, token_gerado_em from terminals where tenant_id = $1 order by nome', [pid(req, 'id')]);
    res.json(r.rows);
  }));

  // Gera um novo token e invalida o anterior na hora.
  app.post('/v1/tenants/:id/terminals/:tid/token', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'), ['tenant_admin', 'integracao']);
    const token = novoToken();
    const r = await db.query(
      `update terminals set token_hash = $3, token_prefixo = $4, token_gerado_em = now()
        where id = $1 and tenant_id = $2`, [pid(req, 'tid'), pid(req, 'id'), hashToken(token), prefixoVisivel(token)]);
    if (!r.rowCount) throw new HttpErro(404, 'Terminal nao encontrado.');
    res.json({ token });
  }));

  // Exclui o terminal: o token deixa de valer e a configuracao dele (terminal_settings) e
  // removida junto. Os dados sincronizados pertencem a empresa e nao sao afetados.
  app.delete('/v1/tenants/:id/terminals/:tid', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'), ['tenant_admin', 'integracao']);
    const r = await db.query('delete from terminals where id = $1 and tenant_id = $2', [pid(req, 'tid'), pid(req, 'id')]);
    if (!r.rowCount) throw new HttpErro(404, 'Terminal nao encontrado.');
    res.json({ ok: true });
  }));

  // Edita o terminal: nome, codigo no PDV e AMBIENTE (producao/homologacao). Mudar o ambiente sobe a versao da configuracao:
  // o terminal busca de novo e passa a receber con_tpamb (1 producao, 2 homologacao) na proxima consulta.
  app.patch('/v1/tenants/:id/terminals/:tid', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'), ['tenant_admin', 'integracao']);
    const b = z.object({
      nome: z.string().trim().min(1).max(100).optional(), codigoLegado: z.string().trim().max(50).nullable().optional(),
      ambiente: z.enum(['producao', 'homologacao']).optional(),
    }).strict().parse(req.body);
    const atual = await db.query('select ambiente from terminals where id = $1 and tenant_id = $2', [pid(req, 'tid'), pid(req, 'id')]);
    if (!atual.rowCount) throw new HttpErro(404, 'Terminal nao encontrado.');
    const r = await db.query(
      `update terminals set nome = coalesce($3, nome), codigo_legado = case when $4::boolean then $5 else codigo_legado end, ambiente = coalesce($6, ambiente)
        where id = $1 and tenant_id = $2 returning id, nome, codigo_legado, ambiente`,
      [pid(req, 'tid'), pid(req, 'id'), b.nome ?? null, b.codigoLegado !== undefined, b.codigoLegado ?? null, b.ambiente ?? null]);
    if (b.ambiente && b.ambiente !== atual.rows[0].ambiente) {
      await db.query(`insert into terminal_settings (terminal_id, valores, versao) values ($1,'{}'::jsonb,1)
                      on conflict (terminal_id) do update set versao = terminal_settings.versao + 1`, [pid(req, 'tid')]);
    }
    res.json({ ...r.rows[0], ambienteAnterior: atual.rows[0].ambiente });
  }));

  // Desativa o terminal: o token deixa de valer (reativar = ativo=true via gerencial futuro).
  app.post('/v1/tenants/:id/terminals/:tid/desativar', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'), ['tenant_admin', 'integracao']);
    const r = await db.query('update terminals set ativo = false where id = $1 and tenant_id = $2', [pid(req, 'tid'), pid(req, 'id')]);
    if (!r.rowCount) throw new HttpErro(404, 'Terminal nao encontrado.');
    res.json({ ok: true });
  }));

  // ---- documentacao da API publica (contratos externos) -------------------------
  app.get('/v1/docs', h(async (req, res) => {
    await usuario(req);
    const publicas = new Set(contratos.map((c) => c.entidade));
    const marcados = new Set([...emDefinicao, ...entidadesComuns].map((d) => d.entidade));
    const pendentes = [
      ...emDefinicao,
      ...Object.values(entidades).filter((e) => !publicas.has(e.nome as never) && !marcados.has(e.nome as never)).map((e) => ({ entidade: e.nome, motivo: 'Nomes e campos em revisao.' })),
    ];
    const rotuloDe = (campo: string) => parametros.find((p) => p.campo === campo);
    const mapa = (m: Record<string, string>) => Object.entries(m).map(([campo, parametro]) => ({ campo, parametro, rotulo: rotuloDe(parametro)?.rotulo ?? '', tipo: rotuloDe(parametro)?.tipo ?? '' }));
    const grupos = new Set([...Object.values(EMPRESA), ...Object.values(FISCAL)]);
    res.json({
      contratos, pendentes, comuns: entidadesComuns, criterios: CRITERIOS, ordemDeCarga: ORDEM_DE_CARGA,
      terminais: {
        empresa: mapa(EMPRESA), fiscal: mapa(FISCAL),
        parametros: parametros.filter((p) => !p.origem && !grupos.has(p.campo) && !['con_certsenha', 'con_certcaminho', 'con_certnome', 'con_urlcertificado'].includes(p.campo))
          .map((p) => ({ campo: p.campo, rotulo: p.rotulo, grupo: p.grupo, tipo: p.tipo, opcoes: p.opcoes })),
      },
    });
  }));

  // ---- cidades (cadastro unico do Hub; carga inicial pelo IBGE) -----------------
  app.get('/v1/cidades', h(async (req, res) => {
    await usuario(req);
    const q = z.object({
      busca: z.string().trim().optional(), uf: z.string().trim().toUpperCase().max(2).optional(),
      limite: z.coerce.number().int().min(1).max(200).default(50), pagina: z.coerce.number().int().min(0).default(0),
    }).parse(req.query);
    const filtro = "where ($1::text is null or uf = $1) and ($2::text is null or nome ilike '%' || $2 || '%' or codigo::text = $2 or codigo_ibge::text = $2)";
    const args = [q.uf || null, q.busca || null];
    const total = await db.query(`select count(*)::int as n from cidades ${filtro}`, args);
    const r = await db.query(
      `select codigo, codigo_ibge, nome, uf, codigo_pais, populacao from cidades ${filtro} order by nome, uf limit $3 offset $4`,
      [...args, q.limite, q.pagina * q.limite]);
    const carga = await db.query('select origem, iniciado_em, duracao_ms, lidas, novas, alteradas, erro from cidades_cargas order by id desc limit 1');
    res.json({ total: total.rows[0].n, itens: r.rows.map(visaoCidade), ultimaCarga: carga.rows[0] ?? null });
  }));

  // Carga/atualizacao pelo IBGE (so administrador do Hub).
  app.post('/v1/cidades/ibge/carregar', h(async (req, res) => {
    const u = await usuario(req);
    if (!u.super) throw new HttpErro(403, 'Apenas administrador do Hub.');
    try { res.json(await carregarIbge(db)); }
    catch (e) { throw new HttpErro(502, `Falha ao consultar o IBGE: ${(e as Error).message}`); }
  }));

  app.patch('/v1/cidades/:codigo', h(async (req, res) => {
    const u = await usuario(req);
    if (!u.super) throw new HttpErro(403, 'Apenas administrador do Hub.');
    const codigo = z.coerce.number().int().parse(pid(req, 'codigo'));
    const b = z.object({
      nome: z.string().trim().min(1).max(70).optional(), uf: z.string().trim().toUpperCase().length(2).optional(),
      codigoPais: z.number().int().optional(), populacao: z.number().int().min(0).nullable().optional(),
    }).strict().parse(req.body);
    const r = await db.query(
      `update cidades set nome = coalesce($2, nome), uf = coalesce($3, uf), codigo_pais = coalesce($4, codigo_pais),
              populacao = case when $5 then $6::int else populacao end, seq = nextval('sync_seq'), atualizado_em = now()
        where codigo = $1 returning codigo, codigo_ibge, nome, uf, codigo_pais, populacao`,
      [codigo, b.nome ?? null, b.uf ?? null, b.codigoPais ?? null, b.populacao !== undefined, b.populacao ?? null]);
    if (!r.rowCount) throw new HttpErro(404, 'Cidade nao encontrada.');
    res.json(visaoCidade(r.rows[0]));
  }));

  // ---- parametros do caixa (antes a tabela caixa / tela do PDV) -------------
  app.get('/v1/parametros', h(async (req, res) => {
    await usuario(req);
    const origem = z.enum(origens).optional().parse(req.query.origem);
    res.json(parametros.filter((p) => !origem || !p.origem || p.origem === origem));
  }));

  const carregarTerminalConfig = async (tenantId: string, terminalId: string) => {
    const r = await db.query(
      `select t.id, t.nome, te.provider, te.provider_config,
              coalesce(s.valores, '{}'::jsonb) as valores, coalesce(s.versao, 0) + te.padroes_versao as versao
         from terminals t join tenants te on te.id = t.tenant_id
         left join terminal_settings s on s.terminal_id = t.id
        where t.id = $1 and t.tenant_id = $2`, [terminalId, tenantId]);
    if (!r.rowCount) throw new HttpErro(404, 'Terminal nao encontrado.');
    return r.rows[0] as { id: string; nome: string; provider: Origem; provider_config: { padroes?: Record<string, unknown> }; valores: Record<string, unknown>; versao: number };
  };

  app.get('/v1/tenants/:id/terminals/:tid/config', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'));
    const c = await carregarTerminalConfig(pid(req, 'id'), pid(req, 'tid'));
    const padroes = c.provider_config?.padroes ?? {};
    res.json({ terminal: { id: c.id, nome: c.nome }, origem: c.provider, versao: c.versao, valores: c.valores, padroes, efetivo: { ...padroes, ...c.valores } });
  }));

  // Atualizacao parcial: so os campos enviados mudam (null limpa). A versao so sobe
  // se algo mudou de fato, para o terminal nao rebaixar configuracao sem necessidade.
  app.put('/v1/tenants/:id/terminals/:tid/config', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'), ['tenant_admin', 'integracao']);
    const c = await carregarTerminalConfig(pid(req, 'id'), pid(req, 'tid'));
    const b = z.object({ valores: z.record(z.unknown()) }).parse(req.body);
    const { valores, erros } = validarParametros(b.valores, c.provider);
    if (erros.length) throw new HttpErro(422, 'Parametros invalidos.', erros);
    const novo: Record<string, unknown> = { ...c.valores };
    for (const [k, v] of Object.entries(valores)) { if (v === null) delete novo[k]; else novo[k] = v; }
    if (canonico(novo) === canonico(c.valores) && c.versao > 0) { res.json({ versao: c.versao, mudou: false }); return; }
    const r = await db.query(
      `insert into terminal_settings (terminal_id, valores, versao, atualizado_por) values ($1,$2,1,$3)
       on conflict (terminal_id) do update set valores = excluded.valores, versao = terminal_settings.versao + 1,
         atualizado_em = now(), atualizado_por = excluded.atualizado_por
       returning versao + (select padroes_versao from tenants where id = $4) as versao`,
      [c.id, JSON.stringify(novo), u.sub, pid(req, 'id')]);
    res.json({ versao: r.rows[0].versao, mudou: true });
  }));

  // Traz do Agrosys os parametros do caixa (LN PDVCONFIG2). Sem "aplicar" so mostra o que mudaria (de -> para);
  // com "aplicar" grava so o que a LN devolveu (o resto segue manual) e, se houver certificado, baixa e guarda cifrado.
  app.post('/v1/tenants/:id/terminals/:tid/config/agrosys', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'), ['tenant_admin', 'integracao']);
    const { aplicar } = z.object({ aplicar: z.boolean().default(false) }).parse(req.body ?? {});
    const c = await carregarTerminalConfig(pid(req, 'id'), pid(req, 'tid'));
    if (c.provider !== 'agrosys') throw new HttpErro(409, 'Parametros do Agrosys so existem na origem Agrosys.');
    const provider = await provedorDaEmpresa(db, pid(req, 'id'), c.id, { correlacao: res.locals.correlacao });
    const r = await provider.operacao(OPERACAO_CONFIG);
    if (!r.ok) {
      const msg = r.descricao || r.texto || 'configuracoes nao cadastradas';
      // Erro 91 do Progress na PDVCONFIG2: a unidade nao tem o registro "Configuracao Caixa PDV" (pdv-config) cadastrado no Agrosys.
      if (/\(91\)/.test(msg)) throw new HttpErro(502, `Agrosys: a unidade ${(c.provider_config?.padroes ?? {}).uni_unidade ?? ''} da empresa ${(c.provider_config?.padroes ?? {}).emp_empresa ?? ''} nao tem a "Configuracao Caixa PDV" cadastrada. Cadastre-a no Agrosys ou confira empresa/unidade/filial dos padroes. (${msg})`);
      throw new HttpErro(502, `Agrosys: ${msg}`);
    }
    const linha = r.tabelas.caixa?.[0];
    if (!linha) throw new HttpErro(502, `Agrosys: a ${OPERACAO_CONFIG} nao devolveu a linha de configuracao (tp-caixa).`);
    const t = traduzirPdvConfig2(linha);
    const { valores, erros } = validarParametros(t.valores, 'agrosys');
    const mudancas = Object.entries(valores)
      .map(([campo, para]) => ({ campo, rotulo: parametros.find((p) => p.campo === campo)?.rotulo ?? campo, de: c.valores[campo] ?? null, para }))
      .filter((x) => canonico(x.de) !== canonico(x.para));
    const certificado = t.certificado ? { disponivel: true, nome: t.certificado.nome, local: new URL(t.certificado.url, 'http://x').host === 'x' ? 'relativo ao web service' : new URL(t.certificado.url).host } : { disponivel: false };
    if (!aplicar) {
      res.json({ aplicado: false, mudancas, semMudanca: Object.keys(valores).length - mudancas.length, recusados: erros, ignorados: t.ignorados, faltando: t.faltando, certificado });
      return;
    }
    let versao = c.versao, mudou = false;
    if (mudancas.length) {
      const novo = { ...c.valores, ...Object.fromEntries(mudancas.map((x) => [x.campo, x.para])) };
      const w = await db.query(
        `insert into terminal_settings (terminal_id, valores, versao, atualizado_por) values ($1,$2,1,$3)
         on conflict (terminal_id) do update set valores = excluded.valores, versao = terminal_settings.versao + 1,
           atualizado_em = now(), atualizado_por = excluded.atualizado_por
         returning versao + (select padroes_versao from tenants where id = $4) as versao`,
        [c.id, JSON.stringify(novo), u.sub, pid(req, 'id')]);
      versao = w.rows[0].versao; mudou = true;
    }
    // Certificado: mesmo caminho do envio manual (confere senha, validade e CNPJ; guarda cifrado). Falha nao desfaz os parametros.
    const avisos: string[] = [];
    let certGravado: Record<string, unknown> | null = null;
    if (t.certificado) {
      try {
        const base = String((c.provider_config?.padroes ?? {}).con_sincurl ?? '');
        const pfx = (await baixarCertificado(t.certificado.url, base)).toString('base64');
        const entrada = { pfx, senha: t.certificado.senha, nome: t.certificado.nome };
        const cnpjNovo = typeof valores.con_cnpj === 'string' ? valores.con_cnpj : null;
        const v = await validarCertificado(pid(req, 'id'), entrada, cnpjNovo);
        certGravado = visaoCert(await gravarCertificado(pid(req, 'id'), v, entrada, `agrosys:${u.sub}`, req.ip));
        const a = avisoCert(v.m, v.emit); if (a) avisos.push(a);
      } catch (e) { avisos.push(`Certificado nao importado: ${(e as Error).message}`); }
    }
    res.json({ aplicado: true, versao, mudou, mudancas, recusados: erros, ignorados: t.ignorados, faltando: t.faltando, certificado: certGravado ?? certificado, avisos });
  }));

  // O terminal (Integrador) busca sua configuracao: so devolve se a versao mudou.
  app.get('/v1/terminal/config', h(async (req, res) => {
    const t = await terminal(req);
    const desde = z.coerce.number().int().min(0).default(0).parse(req.query.desde);
    const r = await db.query(
      `select te.provider_config, t.ambiente, coalesce(s.valores, '{}'::jsonb) as valores, coalesce(s.versao, 0) + te.padroes_versao as versao
         from terminals t join tenants te on te.id = t.tenant_id
         left join terminal_settings s on s.terminal_id = t.id where t.id = $1`, [t.sub]);
    const x = r.rows[0];
    await db.query('update terminals set ultimo_contato = now() where id = $1', [t.sub]);
    if (x.versao <= desde && desde > 0) { res.json({ versao: x.versao, mudou: false }); return; }
    const valores: Record<string, unknown> = { ...(x.provider_config?.padroes ?? {}), ...x.valores };
    // Ambiente fiscal da nota vem do terminal (token): 1 = producao, 2 = homologacao. Vale sobre qualquer con_tpamb manual.
    valores.con_tpamb = x.ambiente === 'producao' ? 1 : 2;
    // Certificado gerenciado pelo Hub: a senha e o arquivo vao so por /v1/terminal/certificado, nunca nos parametros.
    if ((await db.query('select 1 from certificados where tenant_id = $1', [t.tenant])).rowCount) { delete valores.con_certsenha; delete valores.con_certcaminho; }
    res.json({ versao: x.versao, mudou: true, valores });
  }));

  // ---- API publica: contrato externo (nomes simples) ----------------------------------------
  // O sistema do cliente (origem API) envia cada entidade com POST /v1/<caminho> e uma chave de API
  // (hk_...), que identifica a empresa. Corpo: um objeto ou uma lista de objetos (ate 5000).
  const PREFIXO_CHAVE = 'hk_';
  const novaChave = () => PREFIXO_CHAVE + randomBytes(32).toString('base64url');
  const chaveApi = async (req: Request): Promise<string> => {
    const t = bearer(req);
    if (t.startsWith(PREFIXO_CHAVE)) {
      const r = await db.query('update api_keys set ultimo_uso = now() where chave_hash = $1 returning tenant_id', [hashToken(t)]);
      if (r.rowCount) {
        const o = await db.query('select provider from tenants where id = $1 and ativo', [r.rows[0].tenant_id]);
        if (o.rows[0]?.provider !== 'api') throw new HttpErro(403, 'A API publica e da origem API; esta empresa busca os dados no ERP.');
        if (req.res) req.res.locals.log = { ...(req.res.locals.log ?? {}), tenant: r.rows[0].tenant_id, canal: 'cliente->hub' };
        return r.rows[0].tenant_id;
      }
    }
    throw new HttpErro(401, 'Chave de API invalida ou revogada.');
  };

  // mensagens do zod em portugues e apontando o campo
  const erroDoCampo = (i: { code: string; path: (string | number)[]; message: string; keys?: string[]; received?: string }) => {
    if (i.code === 'unrecognized_keys') return (i.keys ?? []).map((k) => ({ campo: k, erro: 'campo desconhecido' }));
    const campo = String(i.path[0] ?? '');
    if (i.code === 'invalid_type' && i.received === 'undefined') return [{ campo, erro: 'obrigatorio' }];
    if (i.code === 'invalid_type') return [{ campo, erro: 'tipo invalido' }];
    if (i.code === 'invalid_union' || i.code === 'invalid_literal') return [{ campo, erro: 'valor invalido (veja os valores esperados)' }];
    if (i.code === 'too_big') return [{ campo, erro: 'texto maior que o tamanho permitido' }];
    return [{ campo, erro: i.message }];
  };

  // id do registro (devolvido ao salvar): serve para consultar, alterar (PATCH), pausar e remover.
  const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const registroDe = async (tenant: string, c: Contrato, id: string) => {
    const r = ID.test(id)
      ? await db.query(
        'select id, chave, dados, seq, pausado from sync_rows where id = $1 and tenant_id = $2 and entidade = $3 and not excluido',
        [id, tenant, c.entidade])
      : { rowCount: 0, rows: [] as never[] };
    if (!r.rowCount) throw new HttpErro(404, 'Registro nao encontrado (ou ja removido).');
    return r.rows[0] as { id: string; chave: string; dados: Record<string, unknown>; seq: number; pausado: boolean };
  };
  const visao = (c: Contrato, row: { id: string; dados: Record<string, unknown>; pausado: boolean }) =>
    ({ id: row.id, ...paraExterno(c, row.dados), pausado: row.pausado });
  const falhaDeValidacao = (issues: unknown[], indice?: number) => {
    const erros: { indice?: number; campo: string; erro: string }[] = [];
    for (const iss of issues) for (const e of erroDoCampo(iss as never)) erros.push(indice === undefined ? e : { indice, ...e });
    return new HttpErro(422, 'Dados invalidos. Nada foi gravado.', erros.slice(0, 50));
  };

  for (const c of contratos) {
    const rota = `/v1/${c.caminho}`;
    const ent = entidades[c.entidade];

    // POST: cria ou atualiza (por chave) um registro ou uma lista; devolve o id de cada um.
    app.post(rota, h(async (req, res) => {
      const tenant = await chaveApi(req);
      const itens: unknown[] | null = Array.isArray(req.body) ? req.body : req.body && typeof req.body === 'object' ? [req.body] : null;
      if (!itens || itens.length === 0) throw new HttpErro(400, 'Envie um objeto ou uma lista de objetos.');
      if (itens.length > 5000) throw new HttpErro(413, 'No maximo 5000 registros por chamada.');

      const schema = schemaExterno(c);
      const linhas: Record<string, unknown>[] = [];
      const erros: { indice: number; campo: string; erro: string }[] = [];
      itens.forEach((item, indice) => {
        const r = schema.safeParse(item);
        if (r.success) { linhas.push(paraLegado(c, r.data as Record<string, unknown>)); return; }
        for (const iss of r.error.issues) for (const e of erroDoCampo(iss as never)) erros.push({ indice, ...e });
      });
      if (erros.length) throw new HttpErro(422, 'Dados invalidos. Nenhum registro foi gravado.', erros.slice(0, 50));

      const inicio = Date.now();
      const r = await ingerir(db, tenant, ent, linhas, true, { teste: res.locals.teste === true });
      if (r.invalidas.length) throw new HttpErro(422, 'Dados invalidos. Nenhum registro foi gravado.', r.invalidas.slice(0, 20));
      await db.query(
        'insert into sync_runs (tenant_id, entidade, origem, duracao_ms, lidas, mudadas) values ($1,$2,$3,$4,$5,$6)',
        [tenant, c.entidade, 'api', Date.now() - inicio, r.recebidas, r.mudadas]);
      const porChave = new Map(r.registros.map((x) => [x.chave, x]));
      const registros = linhas.map((l, indice) => {
        const x = porChave.get(chaveDaLinha(l, ent.chave))!;
        return { indice, id: x.id, situacao: x.situacao, ...chaveExterna(c, l) };
      });
      res.json({ recebidos: r.recebidas, alterados: r.mudadas, inalterados: r.iguais, registros });
    }));

    // GET: lista (paginada) e consulta por id.
    app.get(rota, h(async (req, res) => {
      const tenant = await chaveApi(req);
      const q = z.object({ limite: z.coerce.number().int().min(1).max(500).default(100), depois: z.coerce.number().int().min(0).default(0) }).parse(req.query);
      const r = await db.query(
        `select id, dados, seq, pausado from sync_rows where tenant_id = $1 and entidade = $2 and not excluido and seq > $3
          order by seq limit $4`, [tenant, c.entidade, q.depois, q.limite]);
      res.json({ registros: r.rows.map((x) => visao(c, x)), proximo: r.rows.length === q.limite ? r.rows[r.rows.length - 1].seq : null });
    }));

    app.get(`${rota}/:id`, h(async (req, res) => {
      const tenant = await chaveApi(req);
      res.json(visao(c, await registroDe(tenant, c, pid(req, 'id'))));
    }));

    // PATCH: altera so os campos enviados (ex.: so a quantidade do saldo). A chave nao muda.
    app.patch(`${rota}/:id`, h(async (req, res) => {
      const tenant = await chaveApi(req);
      const atual = await registroDe(tenant, c, pid(req, 'id'));
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw new HttpErro(400, 'Envie um objeto com os campos a alterar.');
      const p = schemaParcial(c).safeParse(req.body);
      if (!p.success) throw falhaDeValidacao(p.error.issues);
      const mudanca = paraLegado(c, p.data as Record<string, unknown>);
      const trocaChave = c.campos.filter((f) => f.obrigatorio && f.legado in mudanca && String(mudanca[f.legado]) !== String(atual.dados[f.legado]));
      if (trocaChave.length) {
        throw new HttpErro(422, 'Nada foi gravado.', trocaChave.map((f) => ({ campo: f.nome, erro: 'a chave do registro nao pode ser alterada' })));
      }
      const r = await ingerir(db, tenant, ent, [{ ...atual.dados, ...mudanca }], true, { teste: res.locals.teste === true });
      if (r.invalidas.length) throw new HttpErro(422, 'Dados invalidos. Nada foi gravado.', r.invalidas.slice(0, 20));
      res.json({ id: atual.id, situacao: r.registros[0].situacao });
    }));

    // DELETE: remove de verdade; o terminal recebe a exclusao no proximo sync.
    app.delete(`${rota}/:id`, h(async (req, res) => {
      const tenant = await chaveApi(req);
      const atual = await registroDe(tenant, c, pid(req, 'id'));
      await db.query("update sync_rows set excluido = true, seq = nextval('sync_seq'), atualizado_em = now() where id = $1", [atual.id]);
      res.json({ id: atual.id, removido: true });
    }));

    // pausar / retomar: o registro continua salvo, mas some dos terminais ate ser retomado.
    for (const [acao, valor] of [['pause', true], ['resume', false]] as const) {
      app.post(`${rota}/:id/${acao}`, h(async (req, res) => {
        const tenant = await chaveApi(req);
        const atual = await registroDe(tenant, c, pid(req, 'id'));
        await db.query(
          `update sync_rows set pausado = $2, seq = case when pausado = $2 then seq else nextval('sync_seq') end,
                  atualizado_em = case when pausado = $2 then atualizado_em else now() end where id = $1`, [atual.id, valor]);
        res.json({ id: atual.id, pausado: valor });
      }));
    }
  }

  // Gestao das chaves (gerencial): a chave completa so aparece ao criar.
  app.post('/v1/tenants/:id/api-keys', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'), ['tenant_admin', 'integracao']);
    const b = z.object({ nome: z.string().min(1).max(80) }).parse(req.body);
    const chave = novaChave();
    const id = randomUUID();
    await db.query('insert into api_keys (id, tenant_id, nome, chave_hash, prefixo) values ($1,$2,$3,$4,$5)',
      [id, pid(req, 'id'), b.nome, hashToken(chave), chave.slice(0, PREFIXO_CHAVE.length + 6)]);
    res.status(201).json({ id, nome: b.nome, chave });
  }));

  app.get('/v1/tenants/:id/api-keys', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'), ['tenant_admin', 'integracao']);
    const r = await db.query('select id, nome, prefixo, criado_em, ultimo_uso from api_keys where tenant_id = $1 order by criado_em', [pid(req, 'id')]);
    res.json(r.rows);
  }));

  app.delete('/v1/tenants/:id/api-keys/:kid', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'), ['tenant_admin', 'integracao']);
    const r = await db.query('delete from api_keys where id = $1 and tenant_id = $2', [pid(req, 'kid'), pid(req, 'id')]);
    if (!r.rowCount) throw new HttpErro(404, 'Chave nao encontrada.');
    res.json({ ok: true });
  }));

  // ---- catalogo de entidades (documentacao viva) --------------------------
  app.get('/v1/catalog', h(async (_req, res) => {
    res.json(Object.values(entidades).map((e) => ({
      entidade: e.nome, operacaoLegada: e.operacaoLegada, tabelaLegada: e.tabelaLegada,
      chave: e.chave, chaveConfirmada: e.chaveConfirmada,
      campos: Object.keys(e.schema.shape),
    })));
  }));

  // ---- ingestao: provider ou sistema do cliente -> Hub ---------------------
  const entidadeDe = (nome: string) => {
    const e = Object.values(entidades).find((x) => x.nome === nome);
    if (!e) throw new HttpErro(404, `Entidade desconhecida: ${nome}`);
    return e;
  };

  app.post('/v1/tenants/:id/ingest/:entidade', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'), ['tenant_admin', 'integracao']);
    const ent = entidadeDe(pid(req, 'entidade'));
    const lote = loteIngestao.parse(req.body);
    const inicio = Date.now();
    const r = await ingerir(db, pid(req, 'id'), ent, lote.linhas, true, { teste: res.locals.teste === true });
    if (r.invalidas.length) throw new HttpErro(422, 'Lote recusado: linhas invalidas.', r.invalidas.slice(0, 20));
    await db.query(
      'insert into sync_runs (tenant_id, entidade, origem, duracao_ms, lidas, mudadas) values ($1,$2,$3,$4,$5,$6)',
      [pid(req, 'id'), ent.nome, 'api', Date.now() - inicio, r.recebidas, r.mudadas]);
    res.json({ recebidas: r.recebidas, mudadas: r.mudadas, iguais: r.iguais });
  }));

  // ---- sincronizacao: Hub -> terminal (via Integrador) ---------------------
  app.get('/v1/sync/:entidade', h(async (req, res) => {
    const t = await terminal(req);
    const ent = entidadeDe(pid(req, 'entidade'));
    const q = z.object({
      desde: z.coerce.number().int().min(0).default(0),
      limite: z.coerce.number().int().min(1).max(2000).default(500),
    }).parse(req.query);
    // Cidades sao um cadastro unico do Hub (igual para todos os clientes): lidas da tabela comum.
    const r = ehComum(ent.nome)
      ? await db.query(
        `select codigo::text as chave, seq, codigo, codigo_ibge, nome, uf, codigo_pais, populacao, false as oculto from cidades
          where seq > $1 order by seq limit $2`, [q.desde, q.limite + 1])
      : await db.query(
        `select chave, seq, dados, (excluido or pausado) as oculto from sync_rows
          where tenant_id = $1 and entidade = $2 and seq > $3 order by seq limit $4`,
        [t.tenant, ent.nome, q.desde, q.limite + 1]);
    if (ehComum(ent.nome)) r.rows = r.rows.map((c: { chave: string; seq: number; codigo: number; codigo_ibge: number; nome: string; uf: string; codigo_pais: number; populacao: number | null; oculto: boolean }) => ({
      chave: c.chave, seq: c.seq, dados: linhaDoTerminal(c), oculto: c.oculto,
    }));
    const temMais = r.rows.length > q.limite;
    // Registro excluido ou pausado (origem API) chega como "excluir": o terminal remove a linha local;
    // ao retomar, vem de novo como "upsert". `dados` continua indo para o terminal saber a chave.
    const mudancas = r.rows.slice(0, q.limite).map(({ oculto, ...m }: { oculto: boolean; chave: string; seq: number; dados: unknown }) => ({ ...m, acao: oculto ? 'excluir' : 'upsert' }));
    await db.query('update terminals set ultimo_contato = now() where id = $1', [t.sub]);
    res.json({
      entidade: ent.nome,
      chave: ent.chave,
      seqMax: mudancas.length ? mudancas[mudancas.length - 1].seq : q.desde,
      temMais,
      mudancas,
    });
  }));

  // ---- roteamento por origem: Hub <-> destino (Agrosys ou sistema do cliente) -----------
  const deProvider = (e: unknown): never => {
    if (e instanceof ErroProvider) throw new HttpErro(e.naoSuportado ? 501 : 409, e.message);
    if (e instanceof ErroSoap) throw new HttpErro(502, e.message);
    if (e instanceof EmpresaNaoEncontrada) throw new HttpErro(404, 'Empresa nao encontrada.');
    throw e;
  };

  // Sincronizar agora (origem Agrosys): o Hub busca tudo no ERP e grava so a diferenca.
  app.post('/v1/tenants/:id/sync', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'), ['tenant_admin', 'integracao']);
    const b = z.object({ entidades: z.array(z.string()).optional() }).parse(req.body ?? {});
    try {
      res.json({ resultados: await sincronizarEmpresa(db, pid(req, 'id'), b.entidades, { correlacao: res.locals.correlacao }) });
    } catch (e) { deProvider(e); }
  }));

  // Prontidao para vender (checklist do que o PDV exige x o que a empresa ja tem no Hub).
  app.get('/v1/tenants/:id/prontidao', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'));
    res.json(await calcularProntidao(db, pid(req, 'id')));
  }));

  // ---- certificado digital A1 (guardado cifrado; o terminal baixa pelo token) ------------------
  const falhaCert = (e: unknown): never => {
    if (e instanceof ErroCertificado) throw new HttpErro(e.status, e.message, { codigo: e.codigo });
    throw e;
  };
  const visaoCert = (c: Record<string, any>) => ({
    existe: true, versao: c.versao, nome: c.nome, titular: c.titular, cnpj: c.cnpj, serie: c.serie, impressao: c.impressao,
    valido_de: c.valido_de, valido_ate: c.valido_ate, dias_restantes: diasRestantes(new Date(c.valido_ate)),
    enviado_por: c.enviado_por, enviado_em: c.enviado_em,
  });
  const auditarCert = (tenantId: string, evento: string, versao: number | null, quem: { usuario?: string; terminal?: string }, ip: string | undefined) =>
    db.query('insert into certificado_acessos (tenant_id, evento, versao, terminal_id, usuario, ip) values ($1,$2,$3,$4,$5,$6)',
      [tenantId, evento, versao, quem.terminal ?? null, quem.usuario ?? null, ip ?? null]);
  // CNPJ do emitente informado nos parametros (terminais ou padroes): o certificado precisa ser da mesma raiz.
  const cnpjEmitente = async (tenantId: string): Promise<string | null> => {
    const r = await db.query(
      `select coalesce((select s.valores->>'con_cnpj' from terminals t join terminal_settings s on s.terminal_id = t.id
                         where t.tenant_id = te.id and coalesce(s.valores->>'con_cnpj', '') <> '' limit 1), te.provider_config->'padroes'->>'con_cnpj') as cnpj
         from tenants te where te.id = $1`, [tenantId]);
    const c = String(r.rows[0]?.cnpj ?? '').replace(/\D/g, '');
    return c.length >= 8 ? c : null;
  };

  type EntradaCert = { pfx: string; senha: string; nome: string };
  // Valida (senha, validade, CNPJ do emitente) SEM gravar nada: assim um terminal nao fica pela metade se o certificado falhar.
  const validarCertificado = async (tenantId: string, c: EntradaCert, cnpjNovo?: string | null) => {
    try {
      const arquivo = Buffer.from(c.pfx, 'base64');
      if (arquivo.length < 100 || arquivo.length > 1_000_000) throw new ErroCertificado(422, 'arquivo_invalido', 'Arquivo de certificado invalido (tamanho).');
      const m = analisarPfx(arquivo, c.senha);
      if (m.validoAte.getTime() < Date.now()) throw new ErroCertificado(422, 'vencido', `Certificado vencido em ${m.validoAte.toLocaleDateString('pt-BR')}.`);
      const emit = cnpjNovo ? cnpjNovo.replace(/\D/g, '') : await cnpjEmitente(tenantId);
      if (emit && m.cnpj && !mesmaRaizCnpj(emit, m.cnpj)) {
        throw new ErroCertificado(422, 'cnpj_diferente', `O CNPJ do certificado (${m.cnpj}) nao confere com o do emitente (${emit}).`);
      }
      return { arquivo, m, emit };
    } catch (e) { return falhaCert(e); }
  };
  const gravarCertificado = async (tenantId: string, v: { arquivo: Buffer; m: ReturnType<typeof analisarPfx> }, c: EntradaCert, quem: string, ip: string | undefined, teste = false) => {
    let k: ReturnType<typeof cifrarCertificado>;
    try { k = cifrarCertificado(v.arquivo, c.senha, tenantId); } catch (e) { return falhaCert(e); }
    const r = await db.query(
      `insert into certificados (tenant_id, nome, pfx_cifrado, senha_cifrada, chave_cifrada, titular, cnpj, serie, impressao, valido_de, valido_ate, enviado_por, teste)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       on conflict (tenant_id) do update set versao = certificados.versao + 1, nome = excluded.nome, pfx_cifrado = excluded.pfx_cifrado,
         senha_cifrada = excluded.senha_cifrada, chave_cifrada = excluded.chave_cifrada, titular = excluded.titular, cnpj = excluded.cnpj,
         serie = excluded.serie, impressao = excluded.impressao, valido_de = excluded.valido_de, valido_ate = excluded.valido_ate,
         enviado_por = excluded.enviado_por, enviado_em = now(), teste = certificados.teste and excluded.teste
       returning *`,
      [tenantId, c.nome, k.pfx, k.senha, k.chave, v.m.titular, v.m.cnpj, v.m.serie, v.m.impressao, v.m.validoDe, v.m.validoAte, quem, teste]);
    await auditarCert(tenantId, 'envio', r.rows[0].versao, { usuario: quem }, ip);
    return r.rows[0];
  };
  const avisoCert = (m: { cnpj: string | null }, emit: string | null) =>
    m.cnpj ? (emit ? null : 'CNPJ do emitente ainda nao informado nos parametros: nao foi possivel conferir.') : 'Nao foi possivel ler o CNPJ no certificado.';
  const entradaCert = z.object({ pfx: z.string().min(100).max(1_400_000), senha: z.string().min(1).max(200), nome: z.string().trim().max(200).default('certificado.pfx') });

  app.put('/v1/tenants/:id/certificado', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'), ['tenant_admin', 'integracao']);
    const b = entradaCert.parse(req.body);
    const v = await validarCertificado(pid(req, 'id'), b);
    const row = await gravarCertificado(pid(req, 'id'), v, b, u.sub, req.ip);
    res.status(201).json({ ...visaoCert(row), aviso: avisoCert(v.m, v.emit) });
  }));

  // So metadados: o arquivo e a senha nunca voltam para o gerencial.
  app.get('/v1/tenants/:id/certificado', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'));
    const r = await db.query('select * from certificados where tenant_id = $1', [pid(req, 'id')]);
    res.json(r.rowCount ? visaoCert(r.rows[0]) : { existe: false });
  }));

  app.delete('/v1/tenants/:id/certificado', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'), ['tenant_admin', 'integracao']);
    const r = await db.query('delete from certificados where tenant_id = $1 returning versao', [pid(req, 'id')]);
    if (!r.rowCount) throw new HttpErro(404, 'Esta empresa nao tem certificado.');
    await auditarCert(pid(req, 'id'), 'remocao', r.rows[0].versao, { usuario: u.sub }, req.ip);
    res.json({ removido: true });
  }));

  app.get('/v1/tenants/:id/certificado/acessos', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'));
    const r = await db.query(
      `select a.id, a.evento, a.versao, a.usuario, a.ip, a.em, t.nome as terminal from certificado_acessos a left join terminals t on t.id = a.terminal_id
        where a.tenant_id = $1 order by a.id desc limit 50`, [pid(req, 'id')]);
    res.json(r.rows);
  }));

  // Terminal (Integrador): confere a versao e, se mudou, baixa o arquivo e a senha. Nunca em cache nem no log de corpos.
  app.get('/v1/terminal/certificado', h(async (req, res) => {
    const t = await terminal(req);
    res.setHeader('Cache-Control', 'no-store');
    const versao = z.coerce.number().int().min(0).default(0).parse(req.query.versao);
    const r = await db.query('select * from certificados where tenant_id = $1', [t.tenant]);
    if (!r.rowCount) { res.json({ existe: false }); return; }
    const c = r.rows[0];
    const meta = { existe: true, versao: c.versao, nome: c.nome, titular: c.titular, cnpj: c.cnpj, serie: c.serie, validoAte: c.valido_ate };
    if (c.versao === versao) { res.json({ ...meta, mudou: false }); return; }
    try {
      const { pfx, senha } = decifrarCertificado({ pfx: c.pfx_cifrado, senha: c.senha_cifrada, chave: c.chave_cifrada }, t.tenant);
      await auditarCert(t.tenant, 'download', c.versao, { terminal: t.sub }, req.ip);
      res.json({ ...meta, mudou: true, pfx: pfx.toString('base64'), senha });
    } catch (e) { falhaCert(e); }
  }));

  // ---- API publica de terminais (chave de API): o sistema do cliente cadastra o terminal inteiro ----------------
  // empresa + fiscal + parametros + certificado, tudo opcional: so o que vier e alterado (ou mande tudo). Rota
  // /v1/terminals (plural) para nao colidir com as do proprio terminal (/v1/terminal/config, /ping, ...).
  const PROIBIDOS_NOS_PARAMETROS = ['con_certsenha', 'con_certcaminho', 'con_certnome', 'con_urlcertificado'];
  const certDaEmpresa = async (tenant: string) => {
    const r = await db.query('select * from certificados where tenant_id = $1', [tenant]);
    return r.rowCount ? visaoCert(r.rows[0]) : { existe: false };
  };
  const visaoTerminalApi = async (tenant: string, t: Record<string, any>) => {
    const c = await carregarTerminalConfig(tenant, t.id);
    const { empresa, fiscal, parametros } = paraContrato({ ...(c.provider_config?.padroes ?? {}), ...c.valores });
    return {
      id: t.id, codigo: t.codigo_legado, nome: t.nome, ambiente: t.ambiente, ativo: t.ativo, ultimoContato: t.ultimo_contato, tokenPrefixo: t.token_prefixo,
      versaoConfiguracao: c.versao, empresa, fiscal, parametros, certificado: await certDaEmpresa(tenant),
    };
  };

  // Cria ou atualiza o terminal. Com "codigo" existente atualiza (so o que veio); sem ele, cria. O token aparece so na criacao.
  const aplicarTerminal = async (tenant: string, existente: Record<string, any> | null, body: unknown, ip: string | undefined, teste = false) => {
    const p = corpoTerminal.safeParse(body);
    if (!p.success) throw falhaDeValidacao(p.error.issues);
    const b = p.data;
    if (!existente && !b.nome) throw new HttpErro(422, 'Informe o nome do terminal para criar.', [{ campo: 'nome', erro: 'obrigatorio' }]);
    const proibidos = Object.keys(b.parametros ?? {}).filter((k) => PROIBIDOS_NOS_PARAMETROS.includes(k));
    if (proibidos.length) throw new HttpErro(422, 'Envie o certificado no campo certificado (nao em parametros).', proibidos.map((campo) => ({ campo, erro: 'use certificado' })));
    const { valores, conflitos } = paraValores(b);
    if (conflitos.length) throw new HttpErro(422, 'O mesmo campo foi enviado em mais de um grupo.', conflitos.map((campo) => ({ campo, erro: 'duplicado' })));
    const origem = (await db.query('select provider from tenants where id = $1', [tenant])).rows[0].provider as Origem;
    const validacao = validarParametros(valores, origem);
    if (validacao.erros.length) throw new HttpErro(422, 'Parametros invalidos. Nada foi gravado.', validacao.erros);
    // o certificado e conferido ANTES de gravar qualquer coisa
    const cnpjNovo = typeof validacao.valores.con_cnpj === 'string' ? validacao.valores.con_cnpj : null;
    const cert = b.certificado ? await validarCertificado(tenant, b.certificado, cnpjNovo) : null;

    let t = existente;
    let situacao: 'criado' | 'alterado' | 'inalterado' = 'inalterado';
    let token: string | undefined;
    if (!t) {
      token = novoToken();
      const id = randomUUID();
      const r = await db.query(
        `insert into terminals (id, tenant_id, nome, codigo_legado, ativo, token_hash, token_prefixo, token_gerado_em, ambiente, teste) values ($1,$2,$3,$4,$5,$6,$7, now(), $8, $9) returning *`,
        [id, tenant, b.nome, b.codigo ?? null, b.ativo ?? true, hashToken(token), prefixoVisivel(token), b.ambiente ?? 'producao', teste]);
      t = r.rows[0];
      situacao = 'criado';
    } else if ((b.nome !== undefined && b.nome !== t.nome) || (b.ativo !== undefined && b.ativo !== t.ativo) || (b.codigo !== undefined && b.codigo !== t.codigo_legado) || (b.ambiente !== undefined && b.ambiente !== t.ambiente)) {
      const r = await db.query('update terminals set nome = coalesce($2, nome), ativo = coalesce($3, ativo), codigo_legado = coalesce($4, codigo_legado), ambiente = coalesce($5, ambiente) where id = $1 returning *',
        [t.id, b.nome ?? null, b.ativo ?? null, b.codigo ?? null, b.ambiente ?? null]);
      t = r.rows[0];
      situacao = 'alterado';
      if (b.ambiente !== undefined && b.ambiente !== existente!.ambiente) {
        await db.query(`insert into terminal_settings (terminal_id, valores, versao) values ($1,'{}'::jsonb,1) on conflict (terminal_id) do update set versao = terminal_settings.versao + 1`, [t!.id]);
      }
    }
    // Uma escrita que nao e de teste num terminal de teste o torna valido para a homologacao (o Postman nunca tira essa marca).
    if (!teste && existente) await db.query('update terminals set teste = false where id = $1 and teste', [t!.id]);
    const c = await carregarTerminalConfig(tenant, t!.id);
    // Numeracao so sobe: o PDV incrementa o contador a cada nota e o ERP o atualiza de tempos em tempos; um valor
    // menor ou igual ao do Hub (na mesma serie) e ignorado, para o terminal nunca repetir numero. Serie nova vale como veio.
    const avisosNumeracao: string[] = [];
    for (const [num, ser, rotulo] of [['con_ultimanfc', 'con_serienfc', 'NFC-e'], ['con_ultimanota', 'con_serie', 'NF-e']] as const) {
      const enviado = validacao.valores[num];
      if (enviado === undefined || enviado === null || b.forcarNumeracao) continue;
      const atual = Number(c.valores[num] ?? 0);
      const mesmaSerie = String(validacao.valores[ser] ?? c.valores[ser] ?? '') === String(c.valores[ser] ?? '');
      if (mesmaSerie && Number(enviado) <= atual) {
        delete validacao.valores[num];
        if (Number(enviado) < atual) avisosNumeracao.push(`Numeracao ${rotulo} nao aplicada: ${enviado} e menor que a atual (${atual}). Use forcarNumeracao para voltar.`);
      }
    }
    const novo: Record<string, unknown> = { ...c.valores };
    for (const [k, v] of Object.entries(validacao.valores)) { if (v === null) delete novo[k]; else novo[k] = v; }
    if (canonico(novo) !== canonico(c.valores) || c.versao === 0) {
      if (Object.keys(validacao.valores).length || c.versao === 0) {
        await db.query(
          `insert into terminal_settings (terminal_id, valores, versao, atualizado_por) values ($1,$2,1,null)
           on conflict (terminal_id) do update set valores = excluded.valores, versao = terminal_settings.versao + 1, atualizado_em = now(), atualizado_por = null`,
          [t!.id, JSON.stringify(novo)]);
        if (situacao === 'inalterado' && canonico(novo) !== canonico(c.valores)) situacao = 'alterado';
      }
    }
    let avisos: string[] = [...avisosNumeracao];
    if (b.certificado && cert) {
      await gravarCertificado(tenant, cert, b.certificado, `api:${tenant}`, ip, teste);
      avisos = [...avisos, avisoCert(cert.m, cert.emit)].filter((x): x is string => !!x);
      if (situacao === 'inalterado') situacao = 'alterado';
    }
    return { situacao, token, avisos, terminal: await visaoTerminalApi(tenant, t!) };
  };
  const terminalDaApi = async (tenant: string, id: string) => {
    const r = await db.query('select * from terminals where id = $1 and tenant_id = $2', [id, tenant]);
    if (!r.rowCount) throw new HttpErro(404, 'Terminal nao encontrado.');
    return r.rows[0] as Record<string, any>;
  };

  app.post('/v1/terminals', h(async (req, res) => {
    const tenant = await chaveApi(req);
    const codigo = req.body && typeof req.body === 'object' && req.body.codigo !== undefined ? String(req.body.codigo) : null;
    const existente = codigo ? (await db.query('select * from terminals where tenant_id = $1 and codigo_legado = $2 order by criado_em limit 1', [tenant, codigo])).rows[0] ?? null : null;
    const r = await aplicarTerminal(tenant, existente, req.body, req.ip, res.locals.teste === true);
    res.status(r.situacao === 'criado' ? 201 : 200).json({ situacao: r.situacao, ...(r.token ? { token: r.token } : {}), avisos: r.avisos, ...r.terminal });
  }));

  // Numeracao em lote, para o ERP atualizar de tempos em tempos: uma linha por terminal (pelo codigo), so serie e
  // ultimo numero. O numero so sobe (a menos de serie nova ou forcarNumeracao); terminal desconhecido nao e criado.
  const itemNumeracao = z.object({
    codigo: z.union([z.string(), z.number()]).transform(String),
    serieNfce: z.union([z.string(), z.number()]).optional(), ultimaNfce: z.number().int().min(0).optional(),
    serieNfe: z.union([z.string(), z.number()]).optional(), ultimaNfe: z.number().int().min(0).optional(),
    forcarNumeracao: z.boolean().optional(),
  }).strict();
  app.post('/v1/terminals/numeracao', h(async (req, res) => {
    const tenant = await chaveApi(req);
    const lista = z.object({ terminais: z.array(z.unknown()).min(1).max(1000) }).safeParse(Array.isArray(req.body) ? { terminais: req.body } : req.body);
    if (!lista.success) throw falhaDeValidacao(lista.error.issues);
    const resultados: Record<string, unknown>[] = [];
    for (const [i, bruto] of lista.data.terminais.entries()) {
      const p = itemNumeracao.safeParse(bruto);
      if (!p.success) { resultados.push({ indice: i, situacao: 'recusado', erros: p.error.issues.map((x) => ({ campo: x.path.join('.'), erro: x.message })) }); continue; }
      const { codigo, forcarNumeracao, ...fiscal } = p.data;
      for (const k of ['serieNfce', 'serieNfe'] as const) if (fiscal[k] !== undefined) fiscal[k] = String(fiscal[k]);
      const existente = (await db.query('select * from terminals where tenant_id = $1 and codigo_legado = $2 order by criado_em limit 1', [tenant, codigo])).rows[0] ?? null;
      if (!existente) { resultados.push({ codigo, situacao: 'nao_encontrado' }); continue; }
      try {
        const r = await aplicarTerminal(tenant, existente, { fiscal, forcarNumeracao }, req.ip, res.locals.teste === true);
        resultados.push({ codigo, situacao: r.situacao, avisos: r.avisos, serieNfce: r.terminal.fiscal.serieNfce ?? null, ultimaNfce: r.terminal.fiscal.ultimaNfce ?? null, serieNfe: r.terminal.fiscal.serieNfe ?? null, ultimaNfe: r.terminal.fiscal.ultimaNfe ?? null });
      } catch (e) {
        if (e instanceof HttpErro) resultados.push({ codigo, situacao: 'recusado', erros: e.detalhe ?? [{ erro: e.message }] }); else throw e;
      }
    }
    res.json({ resultados });
  }));

  app.get('/v1/terminals', h(async (req, res) => {
    const tenant = await chaveApi(req);
    const r = await db.query('select id, nome, codigo_legado as codigo, ambiente, ativo, ultimo_contato as "ultimoContato", token_prefixo as "tokenPrefixo" from terminals where tenant_id = $1 order by nome', [tenant]);
    res.json({ terminais: r.rows });
  }));

  app.get('/v1/terminals/:id', h(async (req, res) => {
    const tenant = await chaveApi(req);
    res.json(await visaoTerminalApi(tenant, await terminalDaApi(tenant, pid(req, 'id'))));
  }));

  app.patch('/v1/terminals/:id', h(async (req, res) => {
    const tenant = await chaveApi(req);
    const r = await aplicarTerminal(tenant, await terminalDaApi(tenant, pid(req, 'id')), req.body, req.ip, res.locals.teste === true);
    res.json({ situacao: r.situacao, avisos: r.avisos, ...r.terminal });
  }));

  app.delete('/v1/terminals/:id', h(async (req, res) => {
    const tenant = await chaveApi(req);
    await terminalDaApi(tenant, pid(req, 'id'));
    await db.query('delete from terminals where id = $1', [pid(req, 'id')]);
    res.json({ removido: true });
  }));

  // Novo token do terminal (o anterior deixa de valer na hora). Aparece so agora.
  app.post('/v1/terminals/:id/token', h(async (req, res) => {
    const tenant = await chaveApi(req);
    await terminalDaApi(tenant, pid(req, 'id'));
    const token = novoToken();
    await db.query('update terminals set token_hash = $2, token_prefixo = $3, token_gerado_em = now() where id = $1', [pid(req, 'id'), hashToken(token), prefixoVisivel(token)]);
    res.json({ token });
  }));

  // Certificado da EMPRESA (vale para todos os terminais dela): o mesmo que o campo "certificado" do terminal.
  app.put('/v1/certificado', h(async (req, res) => {
    const tenant = await chaveApi(req);
    const p = entradaCert.safeParse(req.body);
    if (!p.success) throw falhaDeValidacao(p.error.issues);
    const v = await validarCertificado(tenant, p.data);
    const row = await gravarCertificado(tenant, v, p.data, `api:${tenant}`, req.ip, res.locals.teste === true);
    res.status(201).json({ ...visaoCert(row), aviso: avisoCert(v.m, v.emit) });
  }));
  app.get('/v1/certificado', h(async (req, res) => { res.json(await certDaEmpresa(await chaveApi(req))); }));
  app.delete('/v1/certificado', h(async (req, res) => {
    const tenant = await chaveApi(req);
    const r = await db.query('delete from certificados where tenant_id = $1 returning versao', [tenant]);
    if (!r.rowCount) throw new HttpErro(404, 'Esta empresa nao tem certificado.');
    await auditarCert(tenant, 'remocao', r.rows[0].versao, { usuario: `api:${tenant}` }, req.ip);
    res.json({ removido: true });
  }));
  void EMPRESA; void FISCAL;

  // ---- espelho: consulta dos dados sincronizados (o que os terminais da empresa recebem) ------
  app.get('/v1/tenants/:id/espelho', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'));
    const r = await db.query(
      `select entidade, count(*) filter (where not excluido)::int as total, count(*) filter (where pausado and not excluido)::int as pausados,
              max(atualizado_em) as atualizado_em from sync_rows where tenant_id = $1 group by entidade`, [pid(req, 'id')]);
    const porNome = new Map(r.rows.map((x: { entidade: string }) => [x.entidade, x]));
    const cid = (await db.query('select count(*)::int as total, max(atualizado_em) as atualizado_em from cidades')).rows[0];
    res.json(Object.values(entidades).map((e) => {
      const x = (porNome.get(e.nome) ?? {}) as { total?: number; pausados?: number; atualizado_em?: string };
      return ehComum(e.nome)
        ? { entidade: e.nome, operacao: e.operacaoLegada, comum: true, total: cid.total, pausados: 0, atualizado_em: cid.atualizado_em }
        : { entidade: e.nome, operacao: e.operacaoLegada, comum: false, total: x.total ?? 0, pausados: x.pausados ?? 0, atualizado_em: x.atualizado_em ?? null };
    }));
  }));

  app.get('/v1/tenants/:id/espelho/:entidade', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'));
    const ent = entidadeDe(pid(req, 'entidade'));
    const q = z.object({
      busca: z.string().trim().optional(),
      limite: z.coerce.number().int().min(1).max(200).default(50), pagina: z.coerce.number().int().min(0).default(0),
    }).parse(req.query);
    if (ehComum(ent.nome)) {
      const filtro = "where ($1::text is null or nome ilike '%' || $1 || '%' or codigo::text = $1 or codigo_ibge::text = $1)";
      const total = await db.query(`select count(*)::int as n from cidades ${filtro}`, [q.busca || null]);
      const r = await db.query(
        `select codigo::text as chave, codigo, codigo_ibge, nome, uf, codigo_pais, populacao, seq, atualizado_em from cidades ${filtro} order by codigo limit $2 offset $3`,
        [q.busca || null, q.limite, q.pagina * q.limite]);
      res.json({ entidade: ent.nome, chave: ent.chave, comum: true, total: total.rows[0].n,
        itens: r.rows.map((c: { chave: string; seq: number; atualizado_em: string; codigo: number; codigo_ibge: number; nome: string; uf: string; codigo_pais: number; populacao: number | null }) =>
          ({ chave: c.chave, dados: linhaDoTerminal(c), pausado: false, seq: c.seq, atualizado_em: c.atualizado_em })) });
      return;
    }
    const filtro = 'where tenant_id = $1 and entidade = $2 and not excluido and ($3::text is null or chave ilike \'%\' || $3 || \'%\' or dados::text ilike \'%\' || $3 || \'%\')';
    const total = await db.query(`select count(*)::int as n from sync_rows ${filtro}`, [pid(req, 'id'), ent.nome, q.busca || null]);
    const r = await db.query(
      `select chave, dados, pausado, seq, atualizado_em from sync_rows ${filtro} order by seq desc limit $4 offset $5`,
      [pid(req, 'id'), ent.nome, q.busca || null, q.limite, q.pagina * q.limite]);
    res.json({ entidade: ent.nome, chave: ent.chave, comum: false, total: total.rows[0].n, itens: r.rows });
  }));

  app.get('/v1/tenants/:id/sync-status', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'));
    const r = await db.query(
      `select distinct on (entidade) entidade, origem, iniciado_em, duracao_ms, lidas, mudadas, erro
         from sync_runs where tenant_id = $1 order by entidade, iniciado_em desc`, [pid(req, 'id')]);
    res.json(r.rows);
  }));

  // Tempo real: o terminal pergunta, o Hub encaminha ao destino da empresa e devolve o retorno cru.
  // Nada do corpo e registrado em log (ha senha em PDVLOGIN).
  app.post('/v1/terminal/ops/:operacao', h(async (req, res) => {
    const t = await terminal(req);
    const op = pid(req, 'operacao');
    if (!(operacoesTempoReal as readonly string[]).includes(op)) throw new HttpErro(404, `Operacao desconhecida: ${op}`);
    const b = z.object({
      quantidade: z.number().int().min(0).optional(),
      parametros: z.record(z.union([z.string(), z.number()])).optional(),
      receb: z.string().optional(),
    }).parse(req.body ?? {});
    let r;
    try {
      r = await (await provedorDaEmpresa(db, t.tenant, t.sub, { correlacao: res.locals.correlacao })).operacao(op, b);
    } catch (e) { return deProvider(e); }
    // consulta sob demanda de cadastro tambem alimenta o cache do Hub (melhor esforco)
    const ent = Object.values(entidades).find((x) => x.operacaoLegada === op);
    if (ent && r.ok) {
      const linhas = linhasDaEntidade(r, ent.nome as never);
      if (linhas.length) await ingerir(db, t.tenant, ent, linhas, false).catch(() => undefined);
    }
    await db.query('update terminals set ultimo_contato = now() where id = $1', [t.sub]);
    res.locals.log = { ...res.locals.log, resultado: r.ok ? 'ok' : 'recusado', itens: Object.values(r.tabelas).reduce((x, l) => x + l.length, 0) };
    res.json({ ok: r.ok, codigo: r.codigo, descricao: r.descricao, retorno: r.retorno });
  }));

  // Envios: nota, movimento de caixa e e-mail. O Hub guarda (idempotente por tipo+chave),
  // entrega ao destino da empresa e acompanha o resultado.
  app.post('/v1/terminal/envios/:tipo', h(async (req, res) => {
    const t = await terminal(req);
    const tipo = pid(req, 'tipo');
    if (!(tiposEnvio as readonly string[]).includes(tipo)) throw new HttpErro(404, `Tipo de envio desconhecido: ${tipo}`);
    const b = z.object({ chave: z.string().min(1).max(200), payload: z.record(z.unknown()) }).parse(req.body);
    const r = await db.query(
      `insert into outbox (tenant_id, terminal_id, tipo, chave, payload) values ($1,$2,$3,$4,$5)
       on conflict (tenant_id, tipo, chave) do update set
         payload = case when outbox.status = 'enviado' then outbox.payload else excluded.payload end,
         terminal_id = excluded.terminal_id,
         status = case when outbox.status = 'enviado' then 'enviado' else 'pendente' end,
         tentativas = case when outbox.status = 'enviado' then outbox.tentativas else 0 end,
         proxima_tentativa = case when outbox.status = 'enviado' then outbox.proxima_tentativa else now() end,
         atualizado_em = now()
       returning *`,
      [t.tenant, t.sub, tipo, b.chave, JSON.stringify(b.payload)]);
    const linha = r.rows[0] as LinhaOutbox;
    // Webhooks (origem API): o que o terminal devolveu tambem e disparado para as URLs da empresa.
    if (linha.status !== 'enviado') {
      const tm = await db.query('select nome from terminals where id = $1', [t.sub]);
      const ids = await enfileirar(db, t.tenant, tipo as Evento,
        () => ({ terminal: { id: t.sub, nome: tm.rows[0]?.nome ?? '' }, chave: b.chave, dados: b.payload }), linha.id);
      if (ids.length) void processarEntregas(db, segredo).catch(() => undefined);
    }
    const status = linha.status === 'enviado' ? 'enviado' : await despachar(db, linha, { correlacao: res.locals.correlacao });
    const atual = await db.query('select id, status, mensagem, tentativas from outbox where id = $1', [linha.id]);
    await db.query('update terminals set ultimo_contato = now() where id = $1', [t.sub]);
    res.locals.log = { ...res.locals.log, resultado: status === 'recusado' ? 'recusado' : status === 'erro' ? 'erro' : 'ok', mensagem: atual.rows[0].mensagem };
    res.status(status === 'enviado' ? 200 : 202).json(atual.rows[0]);
  }));

  app.get('/v1/terminal/envios/:id', h(async (req, res) => {
    const t = await terminal(req);
    const r = await db.query('select id, tipo, chave, status, mensagem, tentativas, atualizado_em from outbox where id = $1 and tenant_id = $2',
      [pid(req, 'id'), t.tenant]);
    if (!r.rowCount) throw new HttpErro(404, 'Envio nao encontrado.');
    res.json(r.rows[0]);
  }));

  // Origem API: o sistema do cliente busca os envios pendentes e confirma o resultado.
  // Lista resumida (sem payload) para o gerencial.
  app.get('/v1/tenants/:id/outbox/resumo', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'));
    const r = await db.query(
      `select id, tipo, chave, status, tentativas, mensagem, atualizado_em from outbox
        where tenant_id = $1 order by id desc limit 30`, [pid(req, 'id')]);
    res.json(r.rows);
  }));

  app.get('/v1/tenants/:id/outbox', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'), ['tenant_admin', 'integracao']);
    const q = z.object({
      status: z.enum(['pendente', 'enviado', 'recusado', 'erro']).optional(),
      limite: z.coerce.number().int().min(1).max(500).default(100),
    }).parse(req.query);
    const r = await db.query(
      `select id, tipo, chave, payload, status, tentativas, mensagem, criado_em from outbox
        where tenant_id = $1 and ($2::text is null or status = $2) order by id limit $3`, [pid(req, 'id'), q.status ?? null, q.limite]);
    res.json(r.rows);
  }));

  app.post('/v1/tenants/:id/outbox/:oid/ack', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'), ['tenant_admin', 'integracao']);
    const b = z.object({ ok: z.boolean(), mensagem: z.string().max(2000).optional() }).parse(req.body);
    const r = await db.query(
      `update outbox set status = $3, mensagem = $4, atualizado_em = now()
        where id = $1 and tenant_id = $2 returning id, status`, [pid(req, 'oid'), pid(req, 'id'), b.ok ? 'enviado' : 'recusado', b.mensagem ?? null]);
    if (!r.rowCount) throw new HttpErro(404, 'Envio nao encontrado.');
    res.json(r.rows[0]);
  }));

  // ---- webhooks (so origem API) --------------------------------------------------------------
  // Cada URL cadastrada recebe um POST assinado (HMAC) com o que o terminal devolveu ao Hub.
  const exigirOrigemApi = async (tenantId: string) => {
    const r = await db.query('select provider from tenants where id = $1', [tenantId]);
    if (!r.rowCount) throw new HttpErro(404, 'Empresa nao encontrada.');
    if (r.rows[0].provider !== 'api') throw new HttpErro(409, 'Webhooks so existem na origem API.');
  };
  const dadosWebhook = z.object({
    nome: z.string().trim().min(1).max(80), url: z.string().trim().min(1).max(500),
    eventos: z.array(z.enum(EVENTOS)).default([]),
  });
  const urlValida = (url: string) => { const e = validarUrl(url); if (e) throw new HttpErro(422, e); };
  const visaoWebhook = (w: Record<string, unknown>) => ({
    id: w.id, nome: w.nome, url: w.url, eventos: w.eventos, ativo: w.ativo, segredo_prefixo: w.segredo_prefixo, criado_em: w.criado_em,
    ultima_entrega: w.ultima_entrega ?? null, falhas: w.falhas ?? 0,
  });

  app.post('/v1/tenants/:id/webhooks', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'), ['tenant_admin', 'integracao']);
    await exigirOrigemApi(pid(req, 'id'));
    const b = dadosWebhook.parse(req.body);
    urlValida(b.url);
    const segredo = novoSegredo();
    const id = randomUUID();
    await db.query(
      'insert into webhooks (id, tenant_id, nome, url, segredo_cifrado, segredo_prefixo, eventos) values ($1,$2,$3,$4,$5,$6,$7)',
      [id, pid(req, 'id'), b.nome, b.url, cifrar(segredo, segredoApp), prefixoDoSegredo(segredo), b.eventos]);
    res.status(201).json({ id, nome: b.nome, url: b.url, eventos: b.eventos, segredo });
  }));

  app.get('/v1/tenants/:id/webhooks', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'));
    const r = await db.query(
      `select w.*, (select count(*)::int from webhook_entregas e where e.webhook_id = w.id and e.status = 'falhou') as falhas,
              (select json_build_object('status', e.status, 'codigo_http', e.codigo_http, 'erro', e.erro, 'em', e.atualizado_em)
                 from webhook_entregas e where e.webhook_id = w.id order by e.id desc limit 1) as ultima_entrega
         from webhooks w where w.tenant_id = $1 order by w.criado_em`, [pid(req, 'id')]);
    res.json({ eventos: EVENTOS, webhooks: r.rows.map(visaoWebhook) });
  }));

  // Historico de entregas (sem o corpo) e detalhe de uma entrega.
  app.get('/v1/tenants/:id/webhooks/entregas', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'));
    const q = z.object({
      webhook: z.string().uuid().optional(), status: z.enum(['pendente', 'enviado', 'falhou']).optional(),
      limite: z.coerce.number().int().min(1).max(200).default(50), antes: z.coerce.number().int().optional(),
    }).parse(req.query);
    const r = await db.query(
      `select e.id, e.webhook_id, w.nome as webhook, e.evento, e.status, e.tentativas, e.codigo_http, e.erro, e.duracao_ms, e.criado_em, e.atualizado_em
         from webhook_entregas e join webhooks w on w.id = e.webhook_id
        where e.tenant_id = $1 and ($2::uuid is null or e.webhook_id = $2) and ($3::text is null or e.status = $3) and ($4::bigint is null or e.id < $4)
        order by e.id desc limit $5`, [pid(req, 'id'), q.webhook ?? null, q.status ?? null, q.antes ?? null, q.limite]);
    res.json(r.rows);
  }));

  app.get('/v1/tenants/:id/webhooks/entregas/:eid', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'));
    const r = await db.query(
      `select e.id, w.nome as webhook, w.url, e.evento, e.status, e.tentativas, e.codigo_http, e.erro, e.resposta, e.duracao_ms, e.corpo, e.criado_em, e.atualizado_em
         from webhook_entregas e join webhooks w on w.id = e.webhook_id where e.id = $1 and e.tenant_id = $2`, [pid(req, 'eid'), pid(req, 'id')]);
    if (!r.rowCount) throw new HttpErro(404, 'Entrega nao encontrada.');
    const { corpo, ...resto } = r.rows[0];
    res.json({ ...resto, corpo: JSON.parse(corpo) });
  }));

  app.post('/v1/tenants/:id/webhooks/entregas/:eid/reenviar', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'), ['tenant_admin', 'integracao']);
    const r = await db.query(
      `update webhook_entregas set status = 'pendente', tentativas = 0, proxima_tentativa = now(), atualizado_em = now()
        where id = $1 and tenant_id = $2 returning id, webhook_id, tenant_id, outbox_id, evento, corpo, tentativas`, [pid(req, 'eid'), pid(req, 'id')]);
    if (!r.rowCount) throw new HttpErro(404, 'Entrega nao encontrada.');
    res.json(await entregar(db, r.rows[0], segredoApp));
  }));

  app.patch('/v1/tenants/:id/webhooks/:wid', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'), ['tenant_admin', 'integracao']);
    const b = dadosWebhook.partial().extend({ ativo: z.boolean().optional() }).strict().parse(req.body);
    if (b.url !== undefined) urlValida(b.url);
    const r = await db.query(
      `update webhooks set nome = coalesce($3, nome), url = coalesce($4, url), eventos = coalesce($5, eventos), ativo = coalesce($6, ativo), atualizado_em = now()
        where id = $1 and tenant_id = $2 returning *`, [pid(req, 'wid'), pid(req, 'id'), b.nome ?? null, b.url ?? null, b.eventos ?? null, b.ativo ?? null]);
    if (!r.rowCount) throw new HttpErro(404, 'Webhook nao encontrado.');
    res.json(visaoWebhook(r.rows[0]));
  }));

  app.delete('/v1/tenants/:id/webhooks/:wid', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'), ['tenant_admin', 'integracao']);
    const r = await db.query('delete from webhooks where id = $1 and tenant_id = $2', [pid(req, 'wid'), pid(req, 'id')]);
    if (!r.rowCount) throw new HttpErro(404, 'Webhook nao encontrado.');
    res.json({ removido: true });
  }));

  // Novo segredo (o anterior deixa de valer na hora); aparece so agora.
  app.post('/v1/tenants/:id/webhooks/:wid/segredo', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'), ['tenant_admin', 'integracao']);
    const segredo = novoSegredo();
    const r = await db.query('update webhooks set segredo_cifrado = $3, segredo_prefixo = $4, atualizado_em = now() where id = $1 and tenant_id = $2',
      [pid(req, 'wid'), pid(req, 'id'), cifrar(segredo, segredoApp), prefixoDoSegredo(segredo)]);
    if (!r.rowCount) throw new HttpErro(404, 'Webhook nao encontrado.');
    res.json({ segredo });
  }));

  // Teste: dispara um evento "ping" agora e devolve o resultado da chamada.
  app.post('/v1/tenants/:id/webhooks/:wid/testar', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'), ['tenant_admin', 'integracao']);
    const w = await db.query('select id from webhooks where id = $1 and tenant_id = $2', [pid(req, 'wid'), pid(req, 'id')]);
    if (!w.rowCount) throw new HttpErro(404, 'Webhook nao encontrado.');
    const t = await db.query('select nome from tenants where id = $1', [pid(req, 'id')]);
    const entregaId = randomUUID();
    const envelope: Envelope = {
      id: entregaId, evento: 'ping', criadoEm: new Date().toISOString(), empresa: { id: pid(req, 'id'), nome: t.rows[0]?.nome ?? '' },
      dados: { mensagem: 'Teste de webhook do Hub.' },
    };
    const r = await db.query(
      `insert into webhook_entregas (webhook_id, tenant_id, evento, corpo) values ($1,$2,'ping',$3) returning id, webhook_id, tenant_id, outbox_id, evento, corpo, tentativas`,
      [pid(req, 'wid'), pid(req, 'id'), JSON.stringify(envelope)]);
    res.json({ entrega: r.rows[0].id, ...(await entregar(db, r.rows[0], segredoApp)) });
  }));

  // Reenviar um envio recusado/com erro (depois de corrigir a causa).
  app.post('/v1/tenants/:id/outbox/:oid/reenviar', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'), ['tenant_admin', 'integracao']);
    const r = await db.query(
      `update outbox set status = 'pendente', tentativas = 0, proxima_tentativa = now(), atualizado_em = now()
        where id = $1 and tenant_id = $2 and status in ('recusado', 'erro', 'pendente') returning *`, [pid(req, 'oid'), pid(req, 'id')]);
    if (!r.rowCount) throw new HttpErro(404, 'Envio nao encontrado ou ja enviado.');
    const status = await despachar(db, r.rows[0] as LinhaOutbox, { correlacao: res.locals.correlacao });
    res.json({ id: r.rows[0].id, status });
  }));

  // ---- conexao e log de requisicoes ----------------------------------------------------------
  // Batimento do terminal (o Integrador chama a cada ~2 min): atualiza o ultimo contato e avisa
  // a versao da configuracao, para o terminal buscar a nova assim que ela mudar. Nao vai para o log.
  app.post('/v1/terminal/ping', h(async (req, res) => {
    const t = await terminal(req);
    const r = await db.query(
      `update terminals set ultimo_contato = now() where id = $1 returning (
         select coalesce(s.versao, 0) + te.padroes_versao from tenants te
           left join terminal_settings s on s.terminal_id = $1 where te.id = terminals.tenant_id) as config_versao`, [t.sub]);
    await db.query(`insert into terminal_pings (terminal_id, hora, n) values ($1, date_trunc('hour', now()), 1) on conflict (terminal_id, hora) do update set n = terminal_pings.n + 1`, [t.sub]).catch(() => undefined);
    const cv = await db.query('select versao from certificados where tenant_id = $1', [t.tenant]);
    const quem = (await db.query('select t.nome as terminal, t.ambiente, te.nome as empresa from terminals t join tenants te on te.id = t.tenant_id where t.id = $1', [t.sub])).rows[0];
    res.json({ ok: true, hora: new Date().toISOString(), configVersao: r.rows[0]?.config_versao ?? 0, certificadoVersao: cv.rows[0]?.versao ?? 0, terminal: quem?.terminal ?? null, empresa: quem?.empresa ?? null, ambiente: quem?.ambiente ?? null });
  }));

  // Situacao de cada terminal da empresa e do destino (ERP): conectado? buscando/recebendo? com erro?
  // online <= 5 min do ultimo contato; recente <= 60 min; depois offline; nunca = sem contato.
  app.get('/v1/tenants/:id/conexao', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'));
    const terminais = await db.query(
      `select t.id, t.nome, t.ambiente, t.ativo, t.ultimo_contato,
              case when t.ultimo_contato is null then 'nunca'
                   when t.ultimo_contato > now() - interval '5 minutes' then 'online'
                   when t.ultimo_contato > now() - interval '60 minutes' then 'recente'
                   else 'offline' end as conexao,
              coalesce((select sum(ok + recusados + erros) from trafego_hora h where h.terminal_id = t.id and h.canal = 'terminal->hub' and h.hora > date_trunc('hour', now() - interval '24 hours')), 0)::int as requisicoes_24h,
              coalesce((select sum(recusados + erros) from trafego_hora h where h.terminal_id = t.id and h.canal = 'terminal->hub' and h.hora > date_trunc('hour', now() - interval '24 hours')), 0)::int as erros_24h,
              t.ultima_busca, t.ultima_chamada_erp
         from terminals t where t.tenant_id = $1 order by t.nome`, [pid(req, 'id')]);
    const erp = await db.query(
      `select (select ultima_chamada_erp from tenants where id = $1) as ultima,
              coalesce((select sum(ok + recusados + erros) from trafego_hora where tenant_id = $1 and canal = 'hub->erp' and hora > date_trunc('hour', now() - interval '24 hours')), 0)::int as chamadas_24h,
              coalesce((select sum(erros) from trafego_hora where tenant_id = $1 and canal = 'hub->erp' and hora > date_trunc('hour', now() - interval '24 hours')), 0)::int as erros_24h`,
      [pid(req, 'id')]);
    res.json({ terminais: terminais.rows, erp: erp.rows[0] });
  }));

  // Lista do log (sem corpos). Filtros: terminal, canal, resultado, rota (trecho), ocultarVazias
  // (consultas sem novidade), antes (id, para paginar).
  app.get('/v1/tenants/:id/logs', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'), ['tenant_admin', 'integracao']);
    const q = z.object({
      terminal: z.string().uuid().optional(),
      canal: z.enum(['terminal->hub', 'hub->erp', 'cliente->hub']).optional(),
      resultado: z.enum(['ok', 'recusado', 'erro', 'falha']).optional(),     // falha = erro + recusado
      rota: z.string().max(100).optional(),
      ocultarVazias: z.enum(['0', '1']).default('0'),
      antes: z.coerce.number().int().optional(),
      limite: z.coerce.number().int().min(1).max(200).default(50),
    }).parse(req.query);
    const r = await db.query(
      `select r.id, r.ocorrido_em, r.terminal_id, t.nome as terminal, r.canal, r.metodo, r.rota, r.operacao, r.status_http,
              r.resultado, r.duracao_ms, r.itens, r.mensagem, r.correlacao,
              (r.req_corpo is not null or r.resp_corpo is not null) as tem_corpo, r.corpo_expira_em
         from request_log r left join terminals t on t.id = r.terminal_id
        where r.tenant_id = $1
          and ($2::uuid is null or r.terminal_id = $2) and ($3::text is null or r.canal = $3)
          and ($4::text is null or ($4 = 'falha' and r.resultado <> 'ok') or r.resultado = $4) and ($5::text is null or r.rota ilike '%' || $5 || '%' or r.operacao ilike '%' || $5 || '%')
          and ($6::boolean is false or not (r.resultado = 'ok' and coalesce(r.itens, 0) = 0 and (r.rota like '/v1/sync/%' or r.rota = '/v1/terminal/config')))
          and ($7::bigint is null or r.id < $7)
        order by r.id desc limit $8`,
      [pid(req, 'id'), q.terminal ?? null, q.canal ?? null, q.resultado ?? null, q.rota ?? null, q.ocultarVazias === '1', q.antes ?? null, q.limite]);
    res.json(r.rows);
  }));

  // Detalhe de uma requisicao: com os corpos enquanto a janela de retencao nao expirou.
  app.get('/v1/tenants/:id/logs/:logId', h(async (req, res) => {
    const u = await usuario(req);
    await acessoTenant(u, pid(req, 'id'), ['tenant_admin', 'integracao']);
    const r = await db.query(
      `select r.*, t.nome as terminal, (r.req_corpo is null and r.resp_corpo is null and r.corpo_expira_em is not null) as corpo_expirado,
              (select coalesce(json_agg(json_build_object('id', c.id, 'canal', c.canal, 'operacao', c.operacao, 'resultado', c.resultado, 'duracao_ms', c.duracao_ms) order by c.id), '[]'::json)
                 from request_log c where r.correlacao is not null and c.correlacao = r.correlacao and c.id <> r.id and c.tenant_id = r.tenant_id) as relacionadas
         from request_log r left join terminals t on t.id = r.terminal_id where r.id = $1 and r.tenant_id = $2`, [pid(req, 'logId'), pid(req, 'id')]);
    if (!r.rowCount) throw new HttpErro(404, 'Requisicao nao encontrada.');
    res.json(r.rows[0]);
  }));

  // ---- erros ---------------------------------------------------------------
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpErro) { res.status(err.status).json({ erro: err.message, detalhe: err.detalhe }); return; }
    const tipo = (err as { type?: string }).type;
    if (tipo === 'entity.parse.failed') { res.status(400).json({ erro: 'JSON invalido: envie um objeto ou uma lista de objetos.' }); return; }
    if (tipo === 'entity.too.large') { res.status(413).json({ erro: 'Corpo da requisicao grande demais.' }); return; }
    if (err instanceof ZodError) { res.status(400).json({ erro: 'Requisicao invalida.', detalhe: err.issues }); return; }
    // Erros de dado do Postgres (NUL no texto, texto longo demais, formato invalido) sao culpa da entrada: 4xx, nao 500.
    const pg = (err as { code?: string }).code;
    if (pg === '22021' || pg === '22P05' || pg === '22P02' || pg === '22007' || pg === '22008' || pg === '22003') { res.status(400).json({ erro: 'Valor invalido em algum campo.' }); return; }
    if (pg === '22001') { res.status(422).json({ erro: 'Algum campo excede o tamanho permitido.' }); return; }
    if (pg === '23505') { res.status(409).json({ erro: 'Registro duplicado.' }); return; }
    console.error(err);
    res.status(500).json({ erro: 'Erro interno.' });
  });
  return app;
}
