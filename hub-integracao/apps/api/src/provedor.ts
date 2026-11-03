import { criarProvider, type Provider } from '@hub/providers';
import type { Db } from './db.js';
import { registrarErp } from './log.js';

export class EmpresaNaoEncontrada extends Error {}

// Para o log: a chamada ao ERP fica ligada a empresa, ao terminal e a requisicao que a gerou.
export type ContextoLog = { correlacao?: string | null };

// Provider da empresa: a origem decide para onde vai cada dado. A configuracao efetiva e
// os padroes da empresa mais, se houver terminal, os parametros dele (ex.: empresa/unidade/
// filial do caixa). Cada chamada ao ERP e registrada no log de requisicoes.
export async function provedorDaEmpresa(
  db: Db, tenantId: string, terminalId?: string | null, ctx: ContextoLog = {},
): Promise<Provider> {
  const r = await db.query(
    `select te.provider, te.provider_config, coalesce(s.valores, '{}'::jsonb) as valores
       from tenants te left join terminal_settings s on s.terminal_id = $2
      where te.id = $1 and te.ativo`, [tenantId, terminalId ?? null]);
  if (!r.rowCount) throw new EmpresaNaoEncontrada();
  const x = r.rows[0] as { provider: 'agrosys' | 'api'; provider_config: { padroes?: Record<string, unknown> }; valores: Record<string, unknown> };
  return criarProvider(
    x.provider, { ...(x.provider_config?.padroes ?? {}), ...x.valores }, undefined,
    (ev) => registrarErp(db, { tenant: tenantId, terminal: terminalId, correlacao: ctx.correlacao }, ev),
  );
}
