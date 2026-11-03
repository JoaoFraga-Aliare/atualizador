import { z } from 'zod';
import type { Db } from './db.js';
import { diasLog as diasPadrao, horasCorpo as horasPadrao } from './log.js';
import { RETENCAO_PADRAO, corpoRetencao, expurgarDados, retencaoAtual } from './retencao.js';
import { TIPOS_ALERTA, alertasDe, corpoAlertas, LIMITES_PADRAO, type ConfigAlertas } from './monitoramento.js';

// Menu Logs do administrador: retencao do log de requisicoes, limpeza manual e quais erros geram notificacao.

// Cada categoria = (canal, resultado) do log de requisicoes.
export const CATEGORIAS_LOG = [
  { id: 'terminal_erro', canal: 'terminal->hub', resultado: 'erro', rotulo: 'PDV/Integrador: erro no Hub (falha 5xx)', padrao: true },
  { id: 'terminal_recusado', canal: 'terminal->hub', resultado: 'recusado', rotulo: 'PDV/Integrador: requisição recusada (4xx)', padrao: false },
  { id: 'erp_erro', canal: 'hub->erp', resultado: 'erro', rotulo: 'Agrosys: falha de comunicação (fora do ar, timeout)', padrao: true },
  { id: 'erp_recusado', canal: 'hub->erp', resultado: 'recusado', rotulo: 'Agrosys: operação recusada pelo ERP', padrao: false },
  { id: 'cliente_erro', canal: 'cliente->hub', resultado: 'erro', rotulo: 'Sistema do cliente (API): erro no Hub', padrao: false },
  { id: 'cliente_recusado', canal: 'cliente->hub', resultado: 'recusado', rotulo: 'Sistema do cliente (API): requisição recusada', padrao: false },
] as const;
export type CategoriaLog = (typeof CATEGORIAS_LOG)[number]['id'];
export type Notificar = Record<CategoriaLog, boolean>;

export type ConfigLog = { diasLog: number; horasCorpo: number; notificar: Notificar; gravarSucesso: boolean };

const notificarDe = (salvo: Record<string, unknown> | null | undefined): Notificar =>
  Object.fromEntries(CATEGORIAS_LOG.map((c) => [c.id, typeof salvo?.[c.id] === 'boolean' ? salvo[c.id] : c.padrao])) as Notificar;

// Config efetiva (banco, senao o padrao do ambiente). Cache curto: o registro de log a consulta a cada requisicao.
let cache: { em: number; v: ConfigLog } | null = null;
export const esquecerConfigLog = () => { cache = null; };

export async function configLog(db: Db): Promise<ConfigLog> {
  if (cache && Date.now() - cache.em < 30_000) return cache.v;
  const r = await db.query('select dias_log, horas_corpo, notificar, gravar_sucesso from log_config where id = 1');
  const x = r.rows[0] as { dias_log: number | null; horas_corpo: number | null; notificar: Record<string, unknown>; gravar_sucesso: boolean } | undefined;
  const v: ConfigLog = { diasLog: x?.dias_log ?? diasPadrao(), horasCorpo: x?.horas_corpo ?? horasPadrao(), notificar: notificarDe(x?.notificar), gravarSucesso: x?.gravar_sucesso === true };
  cache = { em: Date.now(), v };
  return v;
}

const corpoConfig = z.object({
  diasLog: z.number().int().min(1).max(3650).nullable().optional(),
  horasCorpo: z.number().int().min(1).max(720).nullable().optional(),
  notificar: z.object(Object.fromEntries(CATEGORIAS_LOG.map((c) => [c.id, z.boolean().optional()]))).strict().optional(),
  alertas: corpoAlertas.optional(),
  retencao: corpoRetencao.optional(),
  gravarSucesso: z.boolean().optional(),      // grava tambem as requisicoes que deram certo (so para depurar: enche o banco)
}).strict();

// Limites e liga/desliga dos alertas de monitoramento (padroes do Hub quando nao personalizados).
export async function configAlertas(db: Db): Promise<ConfigAlertas> {
  return alertasDe((await db.query('select alertas from log_config where id = 1')).rows[0]?.alertas);
}

export async function lerConfig(db: Db) {
  esquecerConfigLog();
  const efetiva = await configLog(db);
  const bruto = (await db.query('select dias_log, horas_corpo from log_config where id = 1')).rows[0] as { dias_log: number | null; horas_corpo: number | null };
  const t = (await db.query(
    `select count(*)::int as linhas, count(*) filter (where req_corpo is not null or resp_corpo is not null)::int as com_corpo,
            min(ocorrido_em) as mais_antiga, pg_total_relation_size('request_log')::bigint as bytes from request_log`)).rows[0];
  return {
    diasLog: efetiva.diasLog, horasCorpo: efetiva.horasCorpo,
    padrao: { diasLog: diasPadrao(), horasCorpo: horasPadrao() },
    personalizado: { diasLog: bruto.dias_log !== null, horasCorpo: bruto.horas_corpo !== null },
    notificar: efetiva.notificar, gravarSucesso: efetiva.gravarSucesso,
    alertas: await configAlertas(db), alertasPadrao: LIMITES_PADRAO,
    retencao: await retencaoAtual(db), retencaoPadrao: RETENCAO_PADRAO,
    tiposAlerta: TIPOS_ALERTA.map((t) => ({ id: t.id, rotulo: t.rotulo })),
    categorias: CATEGORIAS_LOG.map((c) => ({ id: c.id, rotulo: c.rotulo, canal: c.canal, resultado: c.resultado })),
    totais: { linhas: t.linhas, comCorpo: t.com_corpo, maisAntiga: t.mais_antiga, mb: Math.round(Number(t.bytes) / 1024 / 1024 * 10) / 10 },
  };
}

// Atualizacao parcial; diasLog/horasCorpo null voltam ao padrao do ambiente.
export async function gravarConfig(db: Db, corpo: unknown) {
  const p = corpoConfig.safeParse(corpo);
  if (!p.success) return { erros: p.error.issues.map((i) => ({ campo: i.path.join('.'), erro: i.message })) };
  const atual = (await db.query('select dias_log, horas_corpo, notificar, alertas, retencao, gravar_sucesso from log_config where id = 1')).rows[0] as { dias_log: number | null; horas_corpo: number | null; notificar: Record<string, unknown>; alertas: Record<string, any>; retencao: Record<string, unknown>; gravar_sucesso: boolean };
  const b = p.data;
  const dias = b.diasLog === undefined ? atual.dias_log : b.diasLog;
  const horas = b.horasCorpo === undefined ? atual.horas_corpo : b.horasCorpo;
  const notificar = { ...notificarDe(atual.notificar), ...(b.notificar ?? {}) };
  // prazo null volta ao padrao do Hub
  const novaRetencao: Record<string, unknown> = { ...(atual.retencao ?? {}) };
  for (const [k, v] of Object.entries(b.retencao ?? {})) { if (v === null) delete novaRetencao[k]; else novaRetencao[k] = v; }
  const novosAlertas = b.alertas ? { limites: { ...(atual.alertas?.limites ?? {}), ...(b.alertas.limites ?? {}) }, ligados: { ...(atual.alertas?.ligados ?? {}), ...(b.alertas.ligados ?? {}) } } : atual.alertas;
  await db.query('update log_config set dias_log = $1, horas_corpo = $2, notificar = $3, alertas = $4, retencao = $5, gravar_sucesso = $6, atualizado_em = now() where id = 1', [dias, horas, JSON.stringify(notificar), JSON.stringify(novosAlertas ?? {}), JSON.stringify(novaRetencao), b.gravarSucesso ?? atual.gravar_sucesso]);
  esquecerConfigLog();
  return { config: await lerConfig(db) };
}

const corpoLimpar = z.object({
  alvo: z.enum(['corpos', 'sucesso', 'antigos', 'tudo', 'retencao']),
  dias: z.number().int().min(1).max(3650).optional(),
}).strict().refine((b) => b.alvo !== 'antigos' || b.dias !== undefined, { message: 'Informe dias para apagar os registros antigos.', path: ['dias'] });

// corpos: tira so o que foi enviado/recebido; sucesso: apaga as requisicoes ok (guarda as com erro);
// antigos: apaga as mais velhas que N dias; tudo: apaga todo o log.
export async function limpar(db: Db, corpo: unknown) {
  const p = corpoLimpar.safeParse(corpo);
  if (!p.success) return { erros: p.error.issues.map((i) => ({ campo: i.path.join('.'), erro: i.message })) };
  const { alvo, dias } = p.data;
  if (alvo === 'retencao') {
    const x = await expurgarDados(db);
    return { removidas: x.envios + x.entregas + x.execucoes + x.alertas + x.acessosCert + x.exclusoes, corposLimpos: x.conteudoEnvios, detalhe: x };
  }
  if (alvo === 'corpos') {
    const r = await db.query('update request_log set req_corpo = null, resp_corpo = null, corpo_expira_em = null where req_corpo is not null or resp_corpo is not null');
    return { removidas: 0, corposLimpos: r.rowCount ?? 0 };
  }
  const r = alvo === 'sucesso' ? await db.query("delete from request_log where resultado = 'ok'")
    : alvo === 'antigos' ? await db.query("delete from request_log where ocorrido_em < now() - ($1 * interval '1 day')", [dias])
    : await db.query('delete from request_log');
  return { removidas: r.rowCount ?? 0, corposLimpos: 0 };
}

// Erros das ultimas 24 h nas categorias ligadas, agrupados por empresa + canal + rota + resultado.
// id = ultimo registro do grupo: um erro novo no mesmo grupo volta a notificar.
export async function notificacoes(db: Db) {
  const c = await configLog(db);
  const ligadas = CATEGORIAS_LOG.filter((x) => c.notificar[x.id]);
  if (!ligadas.length) return { itens: [] };
  const r = await db.query(
    `select max(r.id)::int as id, r.tenant_id, te.nome as empresa, r.canal, r.resultado, r.rota, r.operacao,
            count(*)::int as total, max(r.ocorrido_em) as ultimo_em,
            (array_agg(r.mensagem order by r.id desc))[1] as mensagem, (array_agg(r.status_http order by r.id desc))[1] as status
       from request_log r join unnest($1::text[], $2::text[]) as c(canal, resultado) on c.canal = r.canal and c.resultado = r.resultado
       left join tenants te on te.id = r.tenant_id
      where r.ocorrido_em > now() - interval '24 hours'
      group by r.tenant_id, te.nome, r.canal, r.resultado, r.rota, r.operacao
      order by max(r.id) desc limit 50`, [ligadas.map((x) => x.canal), ligadas.map((x) => x.resultado)]);
  return { itens: r.rows };
}

// ---- tela global de erros: todas as empresas, do mais recente para o mais antigo ---------------------------------
const PERIODOS: Record<string, string> = { '1h': '1 hour', '24h': '24 hours', '7d': '7 days', '30d': '30 days' };
const corpoErros = z.object({
  periodo: z.enum(['1h', '24h', '7d', '30d']).default('24h'),
  canal: z.enum(['terminal->hub', 'hub->erp', 'cliente->hub']).optional(),
  resultado: z.enum(['falha', 'erro', 'recusado']).default('falha'),            // falha = erro + recusado
  empresa: z.string().uuid().optional(),
  busca: z.string().trim().max(100).optional(),
  antes: z.coerce.number().int().optional(),
  limite: z.coerce.number().int().min(1).max(200).default(50),
}).strict();

export async function errosGlobais(db: Db, query: unknown) {
  const p = corpoErros.safeParse(query);
  if (!p.success) return { erros: p.error.issues.map((i) => ({ campo: i.path.join('.'), erro: i.message })) };
  const q = p.data;
  const onde = `l.ocorrido_em > now() - $1::interval and l.resultado <> 'ok' and ($2::text = 'falha' or l.resultado = $2)
      and ($3::text is null or l.canal = $3) and ($4::uuid is null or l.tenant_id = $4)
      and ($5::text is null or l.mensagem ilike '%' || $5 || '%' or l.rota ilike '%' || $5 || '%' or l.operacao ilike '%' || $5 || '%')`;
  const args = [PERIODOS[q.periodo], q.resultado, q.canal ?? null, q.empresa ?? null, q.busca ?? null];
  const itens = (await db.query(
    `select l.id, l.ocorrido_em, l.tenant_id, te.nome as empresa, l.terminal_id, t.nome as terminal, l.canal, l.metodo, l.rota, l.operacao,
            l.status_http, l.resultado, l.duracao_ms, l.mensagem, (l.req_corpo is not null or l.resp_corpo is not null) as tem_corpo
       from request_log l left join tenants te on te.id = l.tenant_id left join terminals t on t.id = l.terminal_id
      where ${onde} and ($6::bigint is null or l.id < $6) order by l.id desc limit $7`, [...args, q.antes ?? null, q.limite])).rows;
  const resumo = (await db.query(
    `select count(*)::int as total, count(*) filter (where l.resultado = 'erro')::int as erros, count(*) filter (where l.resultado = 'recusado')::int as recusados,
            count(*) filter (where l.canal = 'terminal->hub')::int as terminal, count(*) filter (where l.canal = 'hub->erp')::int as erp,
            count(*) filter (where l.canal = 'cliente->hub')::int as cliente
       from request_log l where ${onde}`, args)).rows[0];
  const porEmpresa = (await db.query(
    `select l.tenant_id as id, te.nome, count(*)::int as total from request_log l left join tenants te on te.id = l.tenant_id
      where ${onde} group by l.tenant_id, te.nome order by total desc limit 10`, args)).rows;
  return { itens, resumo, porEmpresa, proximo: itens.length === q.limite ? itens[itens.length - 1].id : null };
}
