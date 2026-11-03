import { entidades, ehComum, type NomeEntidade } from '@hub/contracts';
import { ErroProvider } from '@hub/providers';
import type { Db } from './db.js';
import { ingerir, entidadePorNome } from './ingestao.js';
import { provedorDaEmpresa, type ContextoLog } from './provedor.js';

export type ResultadoSync = {
  entidade: string; lidas: number; mudadas: number; invalidas: number; duracaoMs: number; erro?: string;
};

// Cadastros comuns (cidades) nao vem do ERP de cada empresa: sao unicos no Hub.
export const entidadesSincronizaveis = (): string[] => Object.values(entidades).map((e) => e.nome).filter((n) => !ehComum(n));

// Busca no Agrosys as entidades do catalogo (todas ou as pedidas) e grava por diferenca.
// Uma entidade com erro nao impede as demais; cada uma registra uma linha em sync_runs.
// So uma sincronizacao por empresa ao mesmo tempo (advisory lock).
export async function sincronizarEmpresa(
  db: Db, tenantId: string, pedidas?: string[], ctx: ContextoLog = {},
): Promise<ResultadoSync[]> {
  const provider = await provedorDaEmpresa(db, tenantId, null, ctx);
  if (provider.tipo !== 'agrosys') {
    throw new ErroProvider('A sincronizacao ativa so existe na origem Agrosys; na origem API o cliente envia os dados.', true);
  }
  const nomes = (pedidas?.length ? pedidas : entidadesSincronizaveis()).filter((n) => !ehComum(n));
  for (const n of nomes) if (!entidadePorNome(n)) throw new ErroProvider(`Entidade desconhecida: ${n}`);

  const c = await db.connect();
  try {
    const lock = await c.query("select pg_try_advisory_lock(hashtext('sync:' || $1)) as ok", [tenantId]);
    if (!lock.rows[0].ok) throw new ErroProvider('Ja existe uma sincronizacao em andamento para esta empresa.');
    try {
      const out: ResultadoSync[] = [];
      for (const nome of nomes) {
        const ent = entidadePorNome(nome)!;
        const t0 = Date.now();
        let lidas = 0, mudadas = 0, invalidas = 0, erro: string | undefined;
        try {
          for await (const pagina of provider.catalogo(nome as NomeEntidade)) {
            const r = await ingerir(db, tenantId, ent, pagina, false);
            lidas += r.recebidas; mudadas += r.mudadas; invalidas += r.invalidas.length;
          }
        } catch (e) { erro = (e as Error).message; }
        const duracaoMs = Date.now() - t0;
        await db.query(
          'insert into sync_runs (tenant_id, entidade, origem, duracao_ms, lidas, mudadas, erro) values ($1,$2,$3,$4,$5,$6,$7)',
          [tenantId, nome, 'provider:agrosys', duracaoMs, lidas, mudadas,
            erro ?? (invalidas ? `${invalidas} linha(s) invalida(s) ignorada(s)` : null)]);
        out.push({ entidade: nome, lidas, mudadas, invalidas, duracaoMs, erro });
      }
      return out;
    } finally {
      await c.query("select pg_advisory_unlock(hashtext('sync:' || $1))", [tenantId]);
    }
  } finally {
    c.release();
  }
}
