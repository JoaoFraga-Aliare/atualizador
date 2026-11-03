import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { redeInternaPermitida, requisicaoSegura } from './seguranca.js';
import type { Db } from './db.js';

// Webhooks (origem API): cada evento vira uma entrega POST assinada para as URLs da empresa.
// Eventos = o que o terminal devolve ao Hub (tipos de envio): nota, movimento-caixa, email.
export const EVENTOS = ['nota', 'movimento-caixa', 'email'] as const;
export type Evento = (typeof EVENTOS)[number] | 'ping';

export const MAX_TENTATIVAS = 8;
const TIMEOUT_MS = 10_000;
const MAX_RESPOSTA = 2000;

// Espera entre tentativas: 1, 2, 4, 8, 16, 32, 60 min.
const esperaMin = (tentativas: number) => Math.min(2 ** Math.max(tentativas - 1, 0), 60);

// ---- segredo ---------------------------------------------------------------------------
const chaveDe = (segredoApp: string) => createHash('sha256').update(`webhooks:${segredoApp}`).digest();

export function cifrar(texto: string, segredoApp: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', chaveDe(segredoApp), iv);
  const dados = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), dados].map((b) => b.toString('base64')).join('.');
}

export function decifrar(valor: string, segredoApp: string): string {
  const [iv, tag, dados] = valor.split('.').map((p) => Buffer.from(p, 'base64'));
  const d = createDecipheriv('aes-256-gcm', chaveDe(segredoApp), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(dados), d.final()]).toString('utf8');
}

export const novoSegredo = () => `whsec_${randomBytes(24).toString('base64url')}`;
export const prefixoDoSegredo = (s: string) => s.slice(0, 11);

// Assinatura: HMAC-SHA256 de "<timestamp>.<corpo>" (o timestamp evita reaproveitar uma entrega antiga).
export const assinar = (segredo: string, timestamp: string, corpo: string) =>
  `sha256=${createHmac('sha256', segredo).update(`${timestamp}.${corpo}`).digest('hex')}`;

// ---- destino ---------------------------------------------------------------------------
// Valida a URL cadastrada: https (http so com rede interna liberada) e sem credenciais embutidas.
export function validarUrl(texto: string): string | null {
  let u: URL;
  try { u = new URL(texto); } catch { return 'URL invalida.'; }
  if (u.username || u.password) return 'A URL nao pode ter usuario e senha.';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && redeInternaPermitida())) return 'Use uma URL https://.';
  return null;
}

// ---- envelope e fila ---------------------------------------------------------------------
export type Envelope = {
  id: string; evento: Evento; criadoEm: string;
  empresa: { id: string; nome: string };
  terminal?: { id: string; nome: string } | null;
  chave?: string;
  dados: unknown;
};

export async function enfileirar(
  db: Db, tenantId: string, evento: Evento, montar: (entregaId: string) => Omit<Envelope, 'id' | 'evento' | 'criadoEm' | 'empresa'>, outboxId: number | null,
): Promise<number[]> {
  const hooks = await db.query(
    `select w.id from webhooks w where w.tenant_id = $1 and w.ativo and (cardinality(w.eventos) = 0 or $2 = any(w.eventos))`,
    [tenantId, evento]);
  if (!hooks.rowCount) return [];
  const t = await db.query('select nome from tenants where id = $1', [tenantId]);
  const ids: number[] = [];
  for (const h of hooks.rows as { id: string }[]) {
    const entregaId = randomUUID();
    const envelope: Envelope = {
      id: entregaId, evento, criadoEm: new Date().toISOString(), empresa: { id: tenantId, nome: t.rows[0]?.nome ?? '' },
      ...montar(entregaId),
    };
    const r = await db.query(
      `insert into webhook_entregas (webhook_id, tenant_id, outbox_id, evento, corpo) values ($1,$2,$3,$4,$5)
       on conflict (webhook_id, outbox_id) where outbox_id is not null do nothing returning id`,
      [h.id, tenantId, outboxId, evento, JSON.stringify(envelope)]);
    if (r.rowCount) ids.push(r.rows[0].id);
  }
  return ids;
}

type LinhaEntrega = { id: number; webhook_id: string; tenant_id: string; outbox_id: number | null; evento: string; corpo: string; tentativas: number };

// Faz uma tentativa. 2xx = enviado (e confirma o envio de origem API no outbox); outra coisa agenda
// nova tentativa ate MAX_TENTATIVAS.
export async function entregar(db: Db, e: LinhaEntrega, segredoApp: string): Promise<{ ok: boolean; codigo: number | null; erro: string | null; ms: number }> {
  const w = await db.query('select url, segredo_cifrado from webhooks where id = $1', [e.webhook_id]);
  const inicio = Date.now();
  let codigo: number | null = null;
  let resposta: string | null = null;
  let erro: string | null = null;
  try {
    if (!w.rowCount) throw new Error('Webhook removido.');
    const { url, segredo_cifrado } = w.rows[0] as { url: string; segredo_cifrado: string };
    const timestamp = String(Math.floor(Date.now() / 1000));
    const r = await requisicaoSegura(url, {
      method: 'POST', timeoutMs: TIMEOUT_MS, maxBytes: MAX_RESPOSTA,
      headers: {
        'content-type': 'application/json', 'user-agent': 'Hub-Webhook/1',
        'x-hub-event': e.evento, 'x-hub-delivery': String(JSON.parse(e.corpo).id), 'x-hub-timestamp': timestamp,
        'x-hub-signature': assinar(decifrar(segredo_cifrado, segredoApp), timestamp, e.corpo),
      },
      body: e.corpo,
    });
    codigo = r.status;
    resposta = r.corpo.toString('utf8').slice(0, MAX_RESPOSTA);
    if (r.status < 200 || r.status >= 300) erro = `HTTP ${r.status}`;
  } catch (x) {
    erro = (x as Error).name === 'TimeoutError' ? 'Tempo esgotado (10 s).' : (x as Error).message;
  }
  const ms = Date.now() - inicio;
  const ok = erro === null;
  const tentativas = e.tentativas + 1;
  const status = ok ? 'enviado' : tentativas >= MAX_TENTATIVAS ? 'falhou' : 'pendente';
  await db.query(
    `update webhook_entregas set status = $2, tentativas = $3, codigo_http = $4, resposta = $5, erro = $6, duracao_ms = $7,
            proxima_tentativa = now() + ($8 * interval '1 minute'), atualizado_em = now() where id = $1`,
    [e.id, status, tentativas, codigo, resposta, erro, ms, ok ? 0 : esperaMin(tentativas)]);
  // A resposta 2xx confirma o recebimento: equivale ao ack do envio (se ainda estava pendente).
  if (ok && e.outbox_id) {
    await db.query(
      `update outbox set status = 'enviado', mensagem = 'Entregue por webhook.', atualizado_em = now() where id = $1 and status = 'pendente'`, [e.outbox_id]);
  }
  return { ok, codigo, erro, ms };
}

// Processa a fila vencida (chamada por um temporizador e logo apos enfileirar).
export async function processarEntregas(db: Db, segredoApp: string, limite = 20): Promise<number> {
  const r = await db.query(
    `update webhook_entregas set proxima_tentativa = now() + interval '2 minutes'
      where id in (select id from webhook_entregas where status = 'pendente' and proxima_tentativa <= now() order by id limit $1 for update skip locked)
      returning id, webhook_id, tenant_id, outbox_id, evento, corpo, tentativas`, [limite]);
  await Promise.all((r.rows as LinhaEntrega[]).map((e) => entregar(db, e, segredoApp).catch(() => undefined)));
  return r.rowCount ?? 0;
}
