import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { EventoErp } from '@hub/providers';
import { caminhosPublicos } from '@hub/contracts';
import type { Db } from './db.js';
import { configLog } from './logs-admin.js';

// ---- janelas de retencao ----------------------------------------------------------------
// A requisicao (rota, status, tempo, resultado) fica HUB_LOG_DIAS; os corpos (o que foi
// enviado/recebido) so HUB_LOG_CORPO_HORAS.
export const horasCorpo = () => Number(process.env.HUB_LOG_CORPO_HORAS ?? 6);
export const diasLog = () => Number(process.env.HUB_LOG_DIAS ?? 60);

const MAX_CORPO = 64 * 1024;
const MAX_MENSAGEM = 500;

// ---- redacao de segredos ------------------------------------------------------------------
const CHAVE_SEGREDO = /(senha|password|passwd|secret|token|authorization|pfx|segredo)/i;
const TEXTO_SEGREDO = /("?[\w-]*(?:senha|password|passwd|token)[\w-]*"?\s*[:=]\s*)("(?:[^"\\]|\\.)*"|[^\s,;&}\]]+)/gi;

export function redigir(valor: unknown, profundidade = 0): unknown {
  if (profundidade > 12) return '[profundo]';
  if (Array.isArray(valor)) return valor.map((v) => redigir(v, profundidade + 1));
  if (valor && typeof valor === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      out[k] = CHAVE_SEGREDO.test(k) ? '***' : redigir(v, profundidade + 1);
    }
    return out;
  }
  if (typeof valor === 'string') {
    const t = valor.trim();
    if (t.startsWith('{') || t.startsWith('[')) {          // JSON dentro de string (ex.: vdadosParam, retorno do ERP)
      try { return JSON.stringify(redigir(JSON.parse(t), profundidade + 1)); } catch { /* texto comum */ }
    }
    return valor.replace(TEXTO_SEGREDO, '$1"***"');
  }
  return valor;
}

// Texto para guardar: sem segredos e com limite de tamanho (marca o corte).
export function paraTexto(valor: unknown): string | null {
  if (valor === undefined || valor === null || valor === '') return null;
  const r = redigir(valor);
  let t = typeof r === 'string' ? r : JSON.stringify(r);
  if (t === '{}' || t === 'null') return null;
  if (t.length > MAX_CORPO) t = t.slice(0, MAX_CORPO) + `…[cortado: ${t.length} caracteres no total]`;
  return t;
}

// ---- gravacao -----------------------------------------------------------------------------
export type EntradaLog = {
  tenant?: string | null; terminal?: string | null;
  canal: 'terminal->hub' | 'hub->erp' | 'cliente->hub';
  correlacao?: string | null; metodo?: string; rota: string; operacao?: string | null;
  status?: number; resultado: 'ok' | 'recusado' | 'erro'; ms?: number; itens?: number | null;
  mensagem?: string | null; req?: unknown; resp?: unknown;
};

// Nunca derruba a requisicao: falha de log vai para o console.
export async function registrar(db: Db, e: EntradaLog): Promise<void> {
  try {
    const { horasCorpo: horasDoCorpo, gravarSucesso } = await configLog(db);
    // tamanho real do que trafegou (antes do corte e da limpeza do conteudo): base do relatorio de consumo por terminal
    const bytes = (v: unknown) => (v === undefined || v === null || v === '' ? 0 : Buffer.byteLength(typeof v === 'string' ? v : JSON.stringify(v)));
    const reqBytes = bytes(e.req), respBytes = bytes(e.resp);

    // 1) A linha completa (com conteudo) so para o que deu errado ou foi recusado; sucesso so se gravarSucesso estiver ligado (depuracao).
    if (e.resultado !== 'ok' || gravarSucesso) {
    const req = paraTexto(e.req);
    const resp = paraTexto(e.resp);
    await db.query(
      `insert into request_log (tenant_id, terminal_id, canal, correlacao, metodo, rota, operacao, status_http, resultado,
                                duracao_ms, itens, mensagem, req_corpo, resp_corpo, corpo_expira_em, req_bytes, resp_bytes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
               case when $13::text is null and $14::text is null then null else now() + ($15 * interval '1 hour') end, $16, $17)`,
      [e.tenant ?? null, e.terminal ?? null, e.canal, e.correlacao ?? null, e.metodo ?? null, e.rota, e.operacao ?? null,
        e.status ?? null, e.resultado, e.ms ?? null, e.itens ?? null,
        e.mensagem ? String(e.mensagem).slice(0, MAX_MENSAGEM) : null, req, resp, horasDoCorpo, reqBytes, respBytes]);
    }

    // 2) Contadores por hora (sempre): alimentam conexao, resumo e consumo e custam uma linha por hora, nao uma por requisicao.
    if (e.tenant) {
      await db.query(
        `insert into trafego_hora (tenant_id, terminal_id, canal, operacao, hora, ok, recusados, erros, ms_total, bytes_in, bytes_out, itens)
         values ($1, coalesce($2::uuid, '00000000-0000-0000-0000-000000000000'), $3, $4, date_trunc('hour', now()), $5, $6, $7, $8, $9, $10, $11)
         on conflict (tenant_id, terminal_id, canal, operacao, hora) do update set ok = trafego_hora.ok + excluded.ok, recusados = trafego_hora.recusados + excluded.recusados,
           erros = trafego_hora.erros + excluded.erros, ms_total = trafego_hora.ms_total + excluded.ms_total, bytes_in = trafego_hora.bytes_in + excluded.bytes_in,
           bytes_out = trafego_hora.bytes_out + excluded.bytes_out, itens = trafego_hora.itens + excluded.itens`,
        [e.tenant, e.terminal ?? null, e.canal, String(e.operacao ?? e.rota).slice(0, 60), e.resultado === 'ok' ? 1 : 0, e.resultado === 'recusado' ? 1 : 0, e.resultado === 'erro' ? 1 : 0,
          e.ms ?? 0, reqBytes, respBytes, e.itens ?? 0]);
      // "ultima busca" do terminal e "ultima chamada ao Agrosys" (tela de conexao)
      const marca = JSON.stringify({ ocorrido_em: new Date().toISOString(), operacao: e.operacao ?? null, resultado: e.resultado, itens: e.itens ?? null, mensagem: e.mensagem ? String(e.mensagem).slice(0, 200) : null });
      if (e.terminal && e.rota.startsWith('/v1/sync/')) await db.query('update terminals set ultima_busca = $2::jsonb where id = $1', [e.terminal, marca]);
      if (e.canal === 'hub->erp') {
        await db.query('update tenants set ultima_chamada_erp = $2::jsonb where id = $1', [e.tenant, marca]);
        if (e.terminal) await db.query('update terminals set ultima_chamada_erp = $2::jsonb where id = $1', [e.terminal, marca]);
      }
    }

  } catch (err) {
    console.error('log:', (err as Error).message);
  }
}

// Chamada do Hub ao ERP (SOAP). O corpo enviado leva param/receb; o recebido, o retorno.
export function registrarErp(db: Db, ctx: { tenant: string; terminal?: string | null; correlacao?: string | null }, ev: EventoErp): void {
  void registrar(db, {
    tenant: ctx.tenant, terminal: ctx.terminal, correlacao: ctx.correlacao, canal: 'hub->erp',
    metodo: 'POST', rota: 'SOAP wsagroServer01', operacao: ev.operacao,
    resultado: ev.erro ? 'erro' : ev.ok ? 'ok' : 'recusado', ms: ev.ms, itens: ev.itens ?? null,
    mensagem: ev.erro ?? ev.descricao,
    req: { param: ev.param, receb: ev.receb === ev.param ? '(igual ao param)' : ev.receb },
    resp: ev.retorno,
  });
}

// ---- middleware das rotas de dados ----------------------------------------------------------
// Registra as requisicoes do terminal (config, sync, ops, envios) e as do sistema do cliente
// (ingest, sync, outbox). Nao registra o ping nem as leituras do proprio gerencial. Sem tenant
// identificado (token invalido) nao grava: evita encher o log com chamadas anonimas.
const ROTAS = [
  /^\/v1\/terminal\/(?!ping)/,
  /^\/v1\/sync\//,
  /^\/v1\/tenants\/[0-9a-f-]{36}\/(ingest\/|sync$|outbox(?!\/resumo))/,
];
// POST /v1/<entidade>: API publica do sistema do cliente
// (inclui /<id> e /<id>/pause|resume)
ROTAS.push(new RegExp('^\\/v1\\/(?:' + caminhosPublicos.join('|') + ')(?:\\/[0-9a-f-]{36}(?:\\/(?:pause|resume))?)?$'));
// API publica de terminais e certificado da empresa (chave de API): aparecem no log do cliente.
ROTAS.push(/^\/v1\/(?:terminals(?:\/(?:numeracao|[0-9a-f-]{36}(?:\/token)?))?|certificado)$/);
const UUID_NA_ROTA = /^\/v1\/tenants\/([0-9a-f-]{36})\//;

const operacaoDaRota = (rota: string) => {
  const pub = rota.match(/^\/v1\/([a-z-]+)(?:\/|$)/)?.[1];
  if (pub && caminhosPublicos.includes(pub)) return pub;
  if (/^\/v1\/terminals(?:\/|$)/.test(rota)) return 'terminals';
  if (rota === '/v1/certificado') return 'certificado';
  const m = rota.match(/^\/v1\/(?:terminal\/(?:ops|envios)|sync)\/([^/]+)/) ?? rota.match(/\/ingest\/([^/]+)/);
  if (m) return decodeURIComponent(m[1]);
  if (rota === '/v1/terminal/config') return 'config';
  if (/\/sync$/.test(rota)) return 'sync';
  if (/\/outbox/.test(rota)) return 'outbox';
  return null;
};

export function logRequisicoes(db: Db) {
  return (req: Request, res: Response, next: NextFunction) => {
    const rota = req.path;
    if (!ROTAS.some((r) => r.test(rota))) return next();

    const t0 = Date.now();
    const correlacao = randomUUID();
    res.locals.correlacao = correlacao;
    res.locals.log = {};
    let corpoResp: unknown;
    const jsonOriginal = res.json.bind(res);
    res.json = (b?: unknown) => { corpoResp = b; return jsonOriginal(b); };

    res.on('finish', () => {
      const L = res.locals.log as { tenant?: string; terminal?: string; canal?: EntradaLog['canal']; resultado?: EntradaLog['resultado']; operacao?: string; itens?: number; mensagem?: string };
      const tenant = L.tenant ?? rota.match(UUID_NA_ROTA)?.[1];
      if (!tenant) return;
      const status = res.statusCode;
      const r = (corpoResp ?? {}) as Record<string, unknown>;
      const itens = L.itens
        ?? (Array.isArray(r.mudancas) ? r.mudancas.length : typeof r.recebidas === 'number' ? r.recebidas : Array.isArray(r.resultados) ? r.resultados.length : Array.isArray(corpoResp) ? corpoResp.length : null);
      void registrar(db, {
        tenant, terminal: L.terminal, canal: L.canal ?? (rota.startsWith('/v1/tenants') ? 'cliente->hub' : 'terminal->hub'),
        correlacao, metodo: req.method, rota, operacao: L.operacao ?? operacaoDaRota(rota), status,
        resultado: L.resultado ?? (status < 400 ? 'ok' : status < 500 ? 'recusado' : 'erro'),
        ms: Date.now() - t0, itens,
        mensagem: L.mensagem ?? (typeof r.erro === 'string' ? r.erro : typeof r.descricao === 'string' ? r.descricao : typeof r.mensagem === 'string' ? r.mensagem : null),
        req: ['POST', 'PUT'].includes(req.method) ? req.body : undefined,
        resp: corpoResp,
      });
    });
    next();
  };
}

// ---- retencao ---------------------------------------------------------------------------------
export async function expurgarLogs(db: Db): Promise<{ corpos: number; linhas: number }> {
  const c = await db.query(
    `update request_log set req_corpo = null, resp_corpo = null
      where corpo_expira_em < now() and (req_corpo is not null or resp_corpo is not null)`);
  const l = await db.query(`delete from request_log where ocorrido_em < now() - ($1 * interval '1 day')`, [(await configLog(db)).diasLog]);
  return { corpos: c.rowCount ?? 0, linhas: l.rowCount ?? 0 };
}
