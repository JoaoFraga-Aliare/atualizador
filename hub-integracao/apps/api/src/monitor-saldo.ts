import { randomUUID } from 'node:crypto';
import { entidades } from '@hub/contracts';
import { linhasDaEntidade } from '@hub/providers';
import type { Db } from './db.js';
import { ingerir } from './ingestao.js';
import { provedorDaEmpresa } from './provedor.js';

// Monitor de saldo (origem Agrosys). Reproduz no Hub o que o PDV fazia com cai_saldomin e
// cai_saldointervalo: com saldo minimo > 0 e intervalo >= 5 s, os produtos ATIVOS cujo saldo
// esta abaixo do minimo sao consultados no ERP (PDVSALDO) a cada intervalo e o saldo novo
// vai para a tabela do Hub, de onde todos os terminais o recebem.
//
// Terminais da mesma empresa/unidade/filial (e mesmo Agrosys) compartilham o saldo: formam um
// grupo e geram UMA consulta por produto a cada ciclo, nao uma por terminal. No grupo vale o
// maior saldo minimo (cobre todos) e o menor intervalo (atende o mais exigente).

export const INTERVALO_MINIMO_SEG = 5;

export type GrupoSaldo = {
  chave: string;
  tenantId: string;
  terminalId: string;                 // terminal usado para montar a configuracao do ERP
  empresa: number; unidade: number; filial: number;
  saldoMin: number;
  intervaloSeg: number;
  terminais: number;
  ignorado?: string;                  // motivo, quando o grupo nao e monitorado
};

export type ResultadoMonitor = {
  consultados: number; atualizados: number; recusados: number; erro?: string;
};

const num = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(typeof v === 'string' ? v.replace(',', '.') : v);
  return Number.isFinite(n) ? n : undefined;
};

// Terminais que participam: saldo minimo > 0 e intervalo de pelo menos 5 s.
export async function gruposDeSaldo(db: Db): Promise<GrupoSaldo[]> {
  const r = await db.query(
    `select t.id as terminal, te.id as tenant, te.provider_config->'padroes' as padroes,
            coalesce(s.valores, '{}'::jsonb) as valores
       from terminals t
       join tenants te on te.id = t.tenant_id
       left join terminal_settings s on s.terminal_id = t.id
      where t.ativo and te.ativo and te.provider = 'agrosys'
      order by t.criado_em, t.id`);
  const grupos = new Map<string, GrupoSaldo>();
  const padroesDe = new Map<string, string>();      // escopo padrao da empresa (para desempate)
  for (const x of r.rows as { terminal: string; tenant: string; padroes: Record<string, unknown> | null; valores: Record<string, unknown> }[]) {
    const ef = { ...(x.padroes ?? {}), ...x.valores };
    const min = num(ef.cai_saldomin), seg = num(ef.cai_saldointervalo);
    const empresa = num(ef.emp_empresa), unidade = num(ef.uni_unidade), filial = num(ef.fil_filial);
    if (!min || min <= 0 || !seg || seg < INTERVALO_MINIMO_SEG) continue;
    if (!empresa || !unidade || !filial || !ef.con_sincurl) continue;
    const padrao = x.padroes ?? {};
    padroesDe.set(x.tenant, `${num(padrao.emp_empresa)}/${num(padrao.uni_unidade)}/${num(padrao.fil_filial)}`);
    const chave = `${x.tenant}|${empresa}/${unidade}/${filial}|${ef.con_sincurl}`;
    const g = grupos.get(chave);
    if (g) {
      g.saldoMin = Math.max(g.saldoMin, min); g.intervaloSeg = Math.min(g.intervaloSeg, seg); g.terminais++;
    } else {
      grupos.set(chave, { chave, tenantId: x.tenant, terminalId: x.terminal, empresa, unidade, filial, saldoMin: min, intervaloSeg: seg, terminais: 1 });
    }
  }

  // O saldo e guardado por empresa (Hub), sem escopo de filial: se os terminais de uma empresa
  // apontam para filiais diferentes, so o escopo padrao da empresa e monitorado.
  const porEmpresa = new Map<string, GrupoSaldo[]>();
  for (const g of grupos.values()) porEmpresa.set(g.tenantId, [...(porEmpresa.get(g.tenantId) ?? []), g]);
  for (const [tenant, lista] of porEmpresa) {
    if (lista.length < 2) continue;
    const escolhido = lista.find((g) => `${g.empresa}/${g.unidade}/${g.filial}` === padroesDe.get(tenant)) ?? lista[0];
    for (const g of lista) if (g !== escolhido) g.ignorado = 'saldo e unico por empresa; outra empresa/unidade/filial ja esta sendo monitorada';
  }
  return [...grupos.values()];
}

// Produtos a consultar: saldo abaixo do minimo e produto ativo (cadastro nao inativo, nao
// pausado nem excluido). Sem cadastro no Hub o produto entra (nao ha o que dizer que e inativo).
export async function produtosAbaixoDoMinimo(db: Db, tenantId: string, saldoMin: number): Promise<number[]> {
  const r = await db.query(
    `select b.chave, (b.dados->>'pro_codigo')::int as pro
       from sync_rows b
       left join sync_rows p on p.tenant_id = b.tenant_id and p.entidade = 'products' and p.chave = b.chave
      where b.tenant_id = $1 and b.entidade = 'stock-balance' and not b.excluido and not b.pausado
        and coalesce((b.dados->>'sal_item')::numeric, 0) < $2
        and (p.id is null or (not p.excluido and not p.pausado
             and lower(coalesce(p.dados->>'pro_ativo', 'yes')) not in ('no', 'false', '0', 'n', 'nao')))`,
    [tenantId, saldoMin]);
  return r.rows.map((x: { pro: number }) => x.pro);
}

const ultimaConsulta = new Map<string, number>();     // tenant|produto -> ms (rodizio entre ciclos)

// Um ciclo do grupo: consulta (no maximo `lote`) produtos, os mais antigos primeiro.
export async function monitorarSaldo(db: Db, g: GrupoSaldo, lote = Number(process.env.HUB_SALDO_LOTE ?? 50)): Promise<ResultadoMonitor> {
  const out: ResultadoMonitor = { consultados: 0, atualizados: 0, recusados: 0 };
  const produtos = (await produtosAbaixoDoMinimo(db, g.tenantId, g.saldoMin))
    .sort((a, b) => (ultimaConsulta.get(`${g.tenantId}|${a}`) ?? 0) - (ultimaConsulta.get(`${g.tenantId}|${b}`) ?? 0))
    .slice(0, lote);
  if (!produtos.length) return out;

  const provider = await provedorDaEmpresa(db, g.tenantId, g.terminalId, { correlacao: randomUUID() });
  const ent = entidades['stock-balance'];
  for (const pro of produtos) {
    ultimaConsulta.set(`${g.tenantId}|${pro}`, Date.now());
    try {
      const r = await provider.operacao('PDVSALDO', {
        parametros: { 'pro-qtps': '0', 'usu-usuario': 'hub', 'pro-codigo': pro },
      });
      out.consultados++;
      if (!r.ok) { out.recusados++; continue; }
      const linhas = linhasDaEntidade(r, 'stock-balance').filter((l) => Number(l.pro_codigo) === pro);
      if (linhas.length) out.atualizados += (await ingerir(db, g.tenantId, ent, linhas, false)).mudadas;
    } catch (e) {
      out.erro = (e as Error).message;                 // ERP fora: encerra o ciclo e tenta no proximo
      break;
    }
  }
  return out;
}

// ---- agendamento -------------------------------------------------------------------------
type Estado = { proximo: number; rodando: boolean; ultimo?: ResultadoMonitor & { em: string } };
const estados = new Map<string, Estado>();
let grupos: GrupoSaldo[] = [];
let gruposEm = 0;

export const estadoMonitorSaldo = () => grupos.map((g) => ({ ...g, ...(estados.get(g.chave) ?? {}) }));

// Chamado a cada segundo; consulta os grupos cujo intervalo venceu. Um grupo nunca roda em
// paralelo consigo mesmo (se o ERP demora, o ciclo seguinte espera).
export async function tickMonitorSaldo(db: Db, agora = Date.now()): Promise<void> {
  if (agora - gruposEm > 15_000) { grupos = await gruposDeSaldo(db); gruposEm = agora; }
  for (const g of grupos) {
    if (g.ignorado) continue;
    const e = estados.get(g.chave) ?? { proximo: 0, rodando: false };
    estados.set(g.chave, e);
    if (e.rodando || agora < e.proximo) continue;
    e.rodando = true;
    monitorarSaldo(db, g)
      .then((r) => { e.ultimo = { ...r, em: new Date().toISOString() }; if (r.erro) console.error('saldo:', r.erro); })
      .catch((err) => console.error('saldo:', (err as Error).message))
      .finally(() => { e.rodando = false; e.proximo = Date.now() + g.intervaloSeg * 1000; });
  }
}

export function iniciarMonitorSaldo(db: Db): NodeJS.Timeout {
  return setInterval(() => { tickMonitorSaldo(db).catch((e) => console.error('saldo:', (e as Error).message)); }, 1000).unref();
}
