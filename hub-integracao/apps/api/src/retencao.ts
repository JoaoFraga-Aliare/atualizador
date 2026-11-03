import { z } from 'zod';
import type { Db } from './db.js';

// Retencao de dados: o Hub nao e um arquivo morto. O cadastro (sync_rows) ja guarda so a versao mais recente de cada registro;
// aqui ficam os prazos das tabelas que acumulam historico (envios, entregas de webhook, execucoes de sync, alertas, exclusoes).
export const RETENCAO_PADRAO = {
  enviosDias: 30,       // notas/movimentos ja enviados ao destino (o conteudo some antes: ver PAYLOAD_DIAS)
  entregasDias: 14,     // entregas de webhook concluidas (as que falharam ficam o dobro)
  execucoesDias: 30,    // historico de sincronizacoes com o Agrosys
  alertasDias: 30,      // alertas ja resolvidos
  exclusoesDias: 90,    // marca de "registro removido" que o terminal precisa ler uma vez
};
export type Retencao = typeof RETENCAO_PADRAO;
const PAYLOAD_DIAS = 3;           // envio ja enviado: o conteudo (nota inteira) sai depois de 3 dias; a linha fica ate enviosDias
const ACESSOS_CERT_DIAS = 180;    // trilha de quem mexeu no certificado

export const corpoRetencao = z.object({
  enviosDias: z.number().int().min(PAYLOAD_DIAS).max(3650).nullable(), entregasDias: z.number().int().min(1).max(3650).nullable(),
  execucoesDias: z.number().int().min(1).max(3650).nullable(), alertasDias: z.number().int().min(1).max(3650).nullable(),
  exclusoesDias: z.number().int().min(7).max(3650).nullable(),
}).partial().strict();

export const retencaoDe = (salvo: Record<string, unknown> | null | undefined): Retencao =>
  ({ ...RETENCAO_PADRAO, ...Object.fromEntries(Object.entries(salvo ?? {}).filter(([, v]) => typeof v === 'number')) }) as Retencao;

export async function retencaoAtual(db: Db): Promise<Retencao> {
  return retencaoDe((await db.query('select retencao from log_config where id = 1')).rows[0]?.retencao);
}

export type ResultadoExpurgo = { conteudoEnvios: number; envios: number; entregas: number; execucoes: number; pings: number; alertas: number; acessosCert: number; exclusoes: number };

export async function expurgarDados(db: Db): Promise<ResultadoExpurgo> {
  const r = await retencaoAtual(db);
  const dia = (n: number) => `now() - (${Math.floor(n)} * interval '1 day')`;
  const n = async (sql: string) => (await db.query(sql)).rowCount ?? 0;
  return {
    // notas ja enviadas: a linha sai no prazo; antes disso o conteudo (a nota inteira) e esvaziado cedo, sem apagar a linha (a chave de idempotencia some junto, mas o terminal ja marcou como exportada)
    envios: await n(`delete from outbox where status = 'enviado' and atualizado_em < ${dia(r.enviosDias)}`),
    conteudoEnvios: await n(`update outbox set payload = '{}'::json, resposta = null where status = 'enviado' and atualizado_em < ${dia(Math.min(PAYLOAD_DIAS, r.enviosDias))} and payload::text <> '{}'`),
    entregas: await n(`delete from webhook_entregas where (status = 'enviado' and atualizado_em < ${dia(r.entregasDias)}) or (status = 'falhou' and atualizado_em < ${dia(r.entregasDias * 2)})`),
    execucoes: await n(`delete from sync_runs where iniciado_em < ${dia(r.execucoesDias)}`),
    alertas: await n(`delete from alertas where resolvido_em is not null and resolvido_em < ${dia(r.alertasDias)}`),
    pings: await n(`delete from terminal_pings where hora < ${dia(r.execucoesDias)}`) + await n(`delete from trafego_hora where hora < ${dia(Math.max(r.execucoesDias, 90))}`),
    acessosCert: await n(`delete from certificado_acessos where em < ${dia(ACESSOS_CERT_DIAS)}`),
    // registro removido: o terminal precisa ler a exclusao uma vez; depois do prazo a linha some de vez
    exclusoes: await n(`delete from sync_rows where excluido and atualizado_em < ${dia(r.exclusoesDias)}`),
  };
}

// No maximo uma vez por hora por processo (o laco do servidor chama a cada 10 min).
let ultima = 0;
export async function expurgarDadosPeriodico(db: Db): Promise<ResultadoExpurgo | null> {
  if (Date.now() - ultima < 3_600_000) return null;
  ultima = Date.now();
  return expurgarDados(db);
}
