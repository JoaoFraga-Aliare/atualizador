import type { TipoEnvio } from '@hub/providers';
import type { Db } from './db.js';
import { provedorDaEmpresa, type ContextoLog } from './provedor.js';

export type LinhaOutbox = {
  id: number; tenant_id: string; terminal_id: string | null; tipo: TipoEnvio; chave: string;
  payload: Record<string, unknown>; status: 'pendente' | 'enviado' | 'recusado' | 'erro'; tentativas: number;
  mensagem: string | null;
};

const MAX_TENTATIVAS = 10;

// Espera crescente entre tentativas tecnicas: 1, 2, 4... ate 60 minutos.
const esperaMin = (tentativas: number) => Math.min(2 ** Math.max(tentativas - 1, 0), 60);

// Entrega um envio ao destino da empresa. Origem agrosys: SOAP agora. Origem api: fica
// pendente para o sistema do cliente buscar. Falha tecnica agenda nova tentativa; recusa
// de negocio e definitiva (ate alguem reenviar com a correcao).
export async function despachar(db: Db, o: LinhaOutbox, ctx: ContextoLog = {}): Promise<LinhaOutbox['status']> {
  let status: LinhaOutbox['status'];
  let mensagem: string | null = null;
  let resposta: string | null = null;
  try {
    const provider = await provedorDaEmpresa(db, o.tenant_id, o.terminal_id, ctx);
    const r = await provider.enviar(o.tipo, o.payload);
    if (r.entrega === 'manual') {
      await db.query('update outbox set mensagem = $2, atualizado_em = now() where id = $1', [o.id, r.mensagem]);
      return 'pendente';
    }
    status = r.ok ? 'enviado' : 'recusado';
    mensagem = r.mensagem;
    resposta = r.retorno ?? null;
  } catch (e) {
    status = 'erro';
    mensagem = (e as Error).message;
  }
  const tentativas = o.tentativas + 1;
  await db.query(
    `update outbox set status = $2, tentativas = $3, mensagem = $4, resposta = $5,
            proxima_tentativa = now() + ($6 * interval '1 minute'), atualizado_em = now()
      where id = $1`,
    [o.id, status, tentativas, mensagem, resposta, status === 'erro' ? esperaMin(tentativas) : 0]);
  return status;
}

// Reentrega os envios com falha tecnica (e os pendentes de empresas Agrosys) cuja hora chegou.
export async function processarFila(db: Db, limite = 20): Promise<number> {
  const r = await db.query(
    `select o.* from outbox o join tenants t on t.id = o.tenant_id
      where o.status in ('pendente', 'erro') and t.provider = 'agrosys' and o.tentativas < $1
        and o.proxima_tentativa <= now()
      order by o.id limit $2`, [MAX_TENTATIVAS, limite]);
  for (const linha of r.rows as LinhaOutbox[]) await despachar(db, linha);
  return r.rowCount ?? 0;
}
