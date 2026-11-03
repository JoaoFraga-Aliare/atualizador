import type { Db } from './db.js';

// Quanto um terminal consome do Hub: requisicoes, trafego, tempo e espaco no banco, por terminal, por operacao e por hora do dia,
// com extrapolacao para um dia e para 30 dias. Somente leitura. Base: trafego_hora (contadores por hora, gravados sempre,
// mesmo com o log so de erros) + terminal_pings. Bytes e pings so existem para o periodo depois das migracoes 019/020.

const PING_BYTES = 230;      // resposta do /v1/terminal/ping (JSON pequeno) + cabecalhos HTTP, em media

export type LinhaTerminal = { terminal: string; empresa: string; ambiente: string; requisicoes: number; pings: number; erros: number; msMedio: number; kbEntrada: number; kbSaida: number };
export type LinhaRota = { rota: string; requisicoes: number; msMedio: number; kbSaidaMedio: number; kbTotal: number; itens: number };

export async function relatorioConsumo(db: Db, horas: number) {
  const intervalo = `${Math.max(1, Math.floor(horas))} hours`;
  const janela = (await db.query(
    `select least(extract(epoch from (now() - min(hora))) / 3600, $1::numeric)::float as h from trafego_hora where canal = 'terminal->hub' and hora > now() - $2::interval`, [horas, intervalo])).rows[0].h as number | null;
  const horasReais = Math.max(janela ?? horas, 1);   // janela curta demais nao serve para extrapolar

  const terminais = (await db.query(
    `select t.nome as terminal, te.nome as empresa, t.ambiente,
            coalesce(l.n, 0)::int as requisicoes, coalesce(p.n, 0)::int as pings, coalesce(l.erros, 0)::int as erros,
            coalesce(l.ms, 0)::float as ms, coalesce(l.entrada, 0)::float as entrada, coalesce(l.saida, 0)::float as saida
       from terminals t join tenants te on te.id = t.tenant_id
       left join (select terminal_id, sum(ok + recusados + erros) as n, sum(recusados + erros) as erros, sum(ms_total)::float / nullif(sum(ok + recusados + erros), 0) as ms,
                         sum(bytes_in) as entrada, sum(bytes_out) as saida
                    from trafego_hora where canal = 'terminal->hub' and hora > now() - $1::interval group by terminal_id) l on l.terminal_id = t.id
       left join (select terminal_id, sum(n) as n from terminal_pings where hora > now() - $1::interval group by terminal_id) p on p.terminal_id = t.id
      where l.n is not null or p.n is not null order by coalesce(l.n, 0) desc`, [intervalo])).rows.map((x: any): LinhaTerminal => ({
    terminal: x.terminal, empresa: x.empresa, ambiente: x.ambiente, requisicoes: Number(x.requisicoes), pings: Number(x.pings), erros: Number(x.erros),
    msMedio: Math.round(x.ms), kbEntrada: Math.round(x.entrada / 1024 * 10) / 10, kbSaida: Math.round((Number(x.saida) + x.pings * PING_BYTES) / 1024 * 10) / 10,
  }));

  const rotas = (await db.query(
    `select operacao as rota, sum(ok + recusados + erros)::int as n, sum(ms_total)::float / nullif(sum(ok + recusados + erros), 0) as ms,
            sum(bytes_out)::float / nullif(sum(ok + recusados + erros), 0) as resp, sum(bytes_in + bytes_out)::float as total, sum(itens)::int as itens
       from trafego_hora where canal = 'terminal->hub' and hora > now() - $1::interval group by operacao order by total desc nulls last, n desc limit 15`, [intervalo])).rows
    .map((x: any): LinhaRota => ({ rota: x.rota, requisicoes: x.n, msMedio: Math.round(x.ms ?? 0), kbSaidaMedio: Math.round((x.resp ?? 0) / 1024 * 10) / 10, kbTotal: Math.round((x.total ?? 0) / 1024), itens: x.itens }));

  const porHora = (await db.query(
    `select extract(hour from hora at time zone 'America/Cuiaba')::int as h, sum(ok + recusados + erros)::int as n from trafego_hora
      where canal = 'terminal->hub' and hora > now() - $1::interval group by 1 order by 1`, [intervalo])).rows as { h: number; n: number }[];

  const envios = (await db.query(
    `select tipo, count(*)::int as n, coalesce(avg(length(payload::text)), 0)::float as bytes from outbox where criado_em > now() - $1::interval group by tipo`, [intervalo])).rows;

  // espaco no banco: o log agora so guarda erros; o que cresce com o trafego e a tabela de contadores
  const bytesLinhaTrafego = ((await db.query(`select coalesce(avg(pg_column_size(l.*)), 120)::float as b from (select * from trafego_hora order by hora desc limit 2000) l`)).rows[0].b as number) * 1.5;
  const tamanhos = (await db.query(
    `select relname as tabela, pg_total_relation_size(oid)::float as bytes from pg_class where relname in ('request_log', 'trafego_hora', 'sync_rows', 'outbox', 'terminal_pings', 'webhook_entregas') and relkind = 'r' order by 2 desc`)).rows
    .map((x: any) => ({ tabela: x.tabela, mb: Math.round(x.bytes / 1024 / 1024 * 10) / 10 }));
  const banco = (await db.query('select pg_database_size(current_database())::float as b')).rows[0].b as number;
  const linhasPorDia = ((await db.query(`select count(*)::float as n from trafego_hora where canal = 'terminal->hub' and hora > now() - $1::interval`, [intervalo])).rows[0].n as number) * (24 / horasReais);

  const soma = (k: keyof LinhaTerminal) => terminais.reduce((s, t) => s + (t[k] as number), 0);
  const req = soma('requisicoes') + soma('pings');
  const kbTotal = soma('kbEntrada') + soma('kbSaida');
  const porDia = 24 / horasReais;
  const nTerminais = Math.max(terminais.length, 1);
  return {
    horas: Math.round(horasReais * 10) / 10, terminais, rotas, porHora, envios,
    extrapolacao: {
      requisicoesDia: Math.round(req * porDia), requisicoesDiaPorTerminal: Math.round(req * porDia / nTerminais),
      mbDia: Math.round(kbTotal * porDia / 1024 * 10) / 10, mbMes: Math.round(kbTotal * porDia * 30 / 1024),
      // com o log so de erros, o banco cresce com os contadores (1 linha por terminal, operacao e hora), nao com cada requisicao
      linhasLogDia: Math.round(linhasPorDia), bytesPorLinhaDeLog: Math.round(bytesLinhaTrafego),
      mbBancoDia: Math.round(linhasPorDia * bytesLinhaTrafego / 1024 / 1024 * 100) / 100,
    },
    banco: { mb: Math.round(banco / 1024 / 1024 * 10) / 10, tabelas: tamanhos },
  };
}
