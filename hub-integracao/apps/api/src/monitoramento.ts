import { z } from 'zod';
import type { Db } from './db.js';
import { requisicaoSegura } from './seguranca.js';

// Alertas do Hub (administrador): avalia, de tempos em tempos, o que precisa de atencao e mantem a lista de alertas
// abertos/resolvidos. Aparece no sino do painel e, se HUB_ALERTA_URL estiver definida, e enviado la (Slack, Teams,
// Uptime Kuma, qualquer endpoint que aceite POST JSON) quando um alerta NOVO abre.

export const TIPOS_ALERTA = [
  { id: 'terminal_sem_contato', rotulo: 'Terminal de produção sem contato' },
  { id: 'envios_parados', rotulo: 'Envios do PDV parados (nota, caixa, e-mail)' },
  { id: 'certificado', rotulo: 'Certificado digital vencendo ou vencido' },
  { id: 'erp_falhando', rotulo: 'Agrosys com falhas repetidas' },
  { id: 'webhook_falhando', rotulo: 'Webhook com entregas falhando' },
] as const;
export type TipoAlerta = (typeof TIPOS_ALERTA)[number]['id'];

export const LIMITES_PADRAO = { terminalSemContatoHoras: 2, enviosParadosMin: 15, certificadoDias: 30, erpErros15min: 5 };
export type Limites = typeof LIMITES_PADRAO;
export type ConfigAlertas = { limites: Limites; ligados: Record<TipoAlerta, boolean> };

export const corpoAlertas = z.object({
  limites: z.object({
    terminalSemContatoHoras: z.number().int().min(1).max(720), enviosParadosMin: z.number().int().min(1).max(10080),
    certificadoDias: z.number().int().min(1).max(365), erpErros15min: z.number().int().min(1).max(1000),
  }).partial().strict().optional(),
  ligados: z.object(Object.fromEntries(TIPOS_ALERTA.map((t) => [t.id, z.boolean().optional()]))).strict().optional(),
}).strict();

export function alertasDe(salvo: Record<string, any> | null | undefined): ConfigAlertas {
  return {
    limites: { ...LIMITES_PADRAO, ...(salvo?.limites ?? {}) },
    ligados: Object.fromEntries(TIPOS_ALERTA.map((t) => [t.id, typeof salvo?.ligados?.[t.id] === 'boolean' ? salvo.ligados[t.id] : true])) as Record<TipoAlerta, boolean>,
  };
}

export type Condicao = { chave: string; tipo: TipoAlerta; tenantId: string | null; terminalId: string | null; titulo: string; detalhe: string };
const tempo = (ms: number) => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 120 ? `${Math.round(m / 60)} h` : `${m} min`; };

export async function condicoesAtuais(db: Db, c: ConfigAlertas): Promise<Condicao[]> {
  const out: Condicao[] = [];
  const L = c.limites;

  if (c.ligados.terminal_sem_contato) {
    // so terminais de producao que ja conectaram alguma vez (homologacao e terminal novo ficam parados sem problema)
    const r = await db.query(
      `select t.id, t.nome, t.tenant_id, te.nome as empresa, t.ultimo_contato from terminals t join tenants te on te.id = t.tenant_id
        where t.ativo and te.ativo and not t.teste and t.ambiente = 'producao' and t.ultimo_contato is not null
          and t.ultimo_contato < now() - ($1 * interval '1 hour')`, [L.terminalSemContatoHoras]);
    for (const x of r.rows) out.push({ chave: `terminal:${x.id}`, tipo: 'terminal_sem_contato', tenantId: x.tenant_id, terminalId: x.id, titulo: `${x.empresa}: terminal ${x.nome} sem contato`, detalhe: `Último contato há ${tempo(Date.now() - new Date(x.ultimo_contato).getTime())} (${new Date(x.ultimo_contato).toLocaleString('pt-BR')}).` });
  }
  if (c.ligados.envios_parados) {
    const r = await db.query(
      `select o.tenant_id, te.nome as empresa, count(*)::int as n, min(o.criado_em) as mais_antigo,
              count(*) filter (where o.status = 'erro')::int as com_erro
         from outbox o join tenants te on te.id = o.tenant_id
        where o.status in ('pendente', 'erro') and o.criado_em < now() - ($1 * interval '1 minute') group by o.tenant_id, te.nome`, [L.enviosParadosMin]);
    for (const x of r.rows) out.push({ chave: `envios:${x.tenant_id}`, tipo: 'envios_parados', tenantId: x.tenant_id, terminalId: null, titulo: `${x.empresa}: ${x.n} envio(s) parado(s)`, detalhe: `O mais antigo espera há ${tempo(Date.now() - new Date(x.mais_antigo).getTime())}${x.com_erro ? `; ${x.com_erro} com falha técnica` : ''}.` });
  }
  if (c.ligados.certificado) {
    const r = await db.query(
      `select c.tenant_id, te.nome as empresa, c.titular, c.valido_ate from certificados c join tenants te on te.id = c.tenant_id
        where not c.teste and te.ativo and c.valido_ate < now() + ($1 * interval '1 day')`, [L.certificadoDias]);
    for (const x of r.rows) {
      const dias = Math.floor((new Date(x.valido_ate).getTime() - Date.now()) / 86_400_000);
      out.push({ chave: `certificado:${x.tenant_id}`, tipo: 'certificado', tenantId: x.tenant_id, terminalId: null,
        titulo: dias < 0 ? `${x.empresa}: certificado vencido` : `${x.empresa}: certificado vence em ${dias} dia(s)`, detalhe: `${x.titular} — válido até ${new Date(x.valido_ate).toLocaleDateString('pt-BR')}.` });
    }
  }
  if (c.ligados.erp_falhando) {
    const r = await db.query(
      `select l.tenant_id, te.nome as empresa, count(*)::int as n, (array_agg(l.mensagem order by l.id desc))[1] as mensagem
         from request_log l join tenants te on te.id = l.tenant_id
        where l.canal = 'hub->erp' and l.resultado = 'erro' and l.ocorrido_em > now() - interval '15 minutes'
        group by l.tenant_id, te.nome having count(*) >= $1`, [L.erpErros15min]);
    for (const x of r.rows) out.push({ chave: `erp:${x.tenant_id}`, tipo: 'erp_falhando', tenantId: x.tenant_id, terminalId: null, titulo: `${x.empresa}: Agrosys falhando`, detalhe: `${x.n} falha(s) nos últimos 15 min. Última: ${x.mensagem ?? 'sem mensagem'}` });
  }
  if (c.ligados.webhook_falhando) {
    const r = await db.query(
      `select w.id, w.nome, w.tenant_id, te.nome as empresa, count(*)::int as n, (array_agg(e.erro order by e.id desc))[1] as erro
         from webhook_entregas e join webhooks w on w.id = e.webhook_id join tenants te on te.id = e.tenant_id
        where e.status = 'falhou' and e.atualizado_em > now() - interval '24 hours' and w.ativo group by w.id, w.nome, w.tenant_id, te.nome`);
    for (const x of r.rows) out.push({ chave: `webhook:${x.id}`, tipo: 'webhook_falhando', tenantId: x.tenant_id, terminalId: null, titulo: `${x.empresa}: webhook ${x.nome} falhando`, detalhe: `${x.n} entrega(s) desistida(s) nas últimas 24 h. Último erro: ${x.erro ?? '—'}` });
  }
  return out;
}

export type Alerta = {
  chave: string; tipo: TipoAlerta; tenant_id: string | null; terminal_id: string | null; titulo: string; detalhe: string;
  aberto_em: string; visto_em: string; resolvido_em: string | null;
};

// Reconcilia as condicoes atuais com a tabela: abre o que e novo (ou reabre), atualiza o que continua e resolve o que sumiu.
export async function avaliarAlertas(db: Db, config: ConfigAlertas): Promise<{ abertos: number; novos: Condicao[]; resolvidos: number }> {
  const condicoes = await condicoesAtuais(db, config);
  const abertosAntes = new Set((await db.query('select chave from alertas where resolvido_em is null')).rows.map((x: { chave: string }) => x.chave));
  for (const c of condicoes) {
    await db.query(
      `insert into alertas (chave, tipo, tenant_id, terminal_id, titulo, detalhe) values ($1,$2,$3,$4,$5,$6)
       on conflict (chave) do update set titulo = excluded.titulo, detalhe = excluded.detalhe, visto_em = now(),
         aberto_em = case when alertas.resolvido_em is null then alertas.aberto_em else now() end, resolvido_em = null`,
      [c.chave, c.tipo, c.tenantId, c.terminalId, c.titulo, c.detalhe]);
  }
  const r = await db.query('update alertas set resolvido_em = now() where resolvido_em is null and not (chave = any($1::text[]))', [condicoes.map((c) => c.chave)]);
  return { abertos: condicoes.length, novos: condicoes.filter((c) => !abertosAntes.has(c.chave)), resolvidos: r.rowCount ?? 0 };
}

export async function listarAlertas(db: Db): Promise<{ abertos: Alerta[]; resolvidos: Alerta[] }> {
  const abertos = (await db.query('select * from alertas where resolvido_em is null order by aberto_em desc limit 200')).rows as Alerta[];
  const resolvidos = (await db.query("select * from alertas where resolvido_em > now() - interval '24 hours' order by resolvido_em desc limit 50")).rows as Alerta[];
  return { abertos, resolvidos };
}

// Aviso externo (HUB_ALERTA_URL): um POST JSON por alerta novo. Falha de envio nao derruba nada.
export async function avisarExterno(novos: Condicao[]): Promise<void> {
  const url = process.env.HUB_ALERTA_URL;
  if (!url || !novos.length) return;
  for (const n of novos) {
    const texto = `[Hub] ${n.titulo} — ${n.detalhe}`;
    // "text" serve para Slack/Teams/Discord (content); o resto vai estruturado para quem quiser tratar
    const corpo = JSON.stringify({ text: texto, content: texto, alerta: { tipo: n.tipo, chave: n.chave, titulo: n.titulo, detalhe: n.detalhe, empresaId: n.tenantId } });
    await requisicaoSegura(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: corpo, timeoutMs: 8000, maxBytes: 2000 })
      .catch((e) => console.error('alerta externo:', (e as Error).message));
  }
}
