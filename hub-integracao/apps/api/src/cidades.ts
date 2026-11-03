import type { Db } from './db.js';

// Cidades: cadastro unico do Hub. `codigo` e o codigo do PDV (numeracao interna do Agrosys, cid_cidade);
// o codigo IBGE do municipio e outra coluna (cid_ibge). A carga vem da API publica de localidades do IBGE
// e o terminal recebe pela sincronizacao normal (/v1/sync/cities).
export const PAIS_BRASIL = 1058;

export type Cidade = { codigo: number; nome: string; uf: string; codigoIbge: number; codigoPais: number; populacao: number | null };
type LinhaCidade = { codigo: number; codigo_ibge: number; nome: string; uf: string; codigo_pais: number; populacao: number | null };

type MunicipioIbge = {
  id: number; nome: string;
  microrregiao?: { mesorregiao?: { UF?: { sigla?: string } } } | null;
  'regiao-imediata'?: { 'regiao-intermediaria'?: { UF?: { sigla?: string } } } | null;
};

const base = () => (process.env.HUB_IBGE_URL ?? 'https://servicodados.ibge.gov.br').replace(/\/$/, '');

// Linha no formato do terminal (colunas da tabela cidade do PDV).
export const linhaDoTerminal = (c: LinhaCidade) => ({
  cid_cidade: c.codigo, cid_nome: c.nome, est_estado: c.uf, cid_ibge: c.codigo_ibge, pai_pais: c.codigo_pais, populacao: c.populacao,
});

export const visao = (c: LinhaCidade): Cidade => ({
  codigo: c.codigo, nome: c.nome, uf: c.uf, codigoIbge: c.codigo_ibge, codigoPais: c.codigo_pais, populacao: c.populacao,
});

export async function buscarMunicipiosIbge(): Promise<{ codigo: number; nome: string; uf: string }[]> {
  const r = await fetch(`${base()}/api/v1/localidades/municipios`, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`IBGE respondeu ${r.status}`);
  const lista = await r.json() as MunicipioIbge[];
  if (!Array.isArray(lista) || !lista.length) throw new Error('IBGE devolveu uma lista vazia');
  const out: { codigo: number; nome: string; uf: string }[] = [];
  for (const m of lista) {
    // alguns municipios novos vem sem microrregiao: a UF esta na regiao imediata
    const uf = m.microrregiao?.mesorregiao?.UF?.sigla ?? m['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla;
    if (m.id && m.nome && uf) out.push({ codigo: m.id, nome: m.nome, uf });
  }
  return out;
}

// Nome no padrao do Agrosys/PDV: maiusculo e sem acento (ex.: "Acrelândia" -> "ACRELANDIA").
export const nomePadrao = (nome: string) => nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

// Carga/atualizacao pelo IBGE, casando pelo codigo IBGE: municipio novo ganha o proximo codigo do PDV;
// o ja existente so muda se o nome (ignorando acento/caixa) ou a UF mudaram de verdade. Pais e populacao
// editados no Hub ficam.
export async function carregarIbge(db: Db): Promise<{ lidas: number; novas: number; alteradas: number }> {
  const inicio = Date.now();
  try {
    const lista = await buscarMunicipiosIbge();
    const atuais = new Map<number, { nome: string; uf: string }>(
      (await db.query('select codigo_ibge, nome, uf from cidades')).rows.map((r: { codigo_ibge: number; nome: string; uf: string }) => [r.codigo_ibge, { nome: r.nome, uf: r.uf }]));
    const novas = lista.filter((m) => !atuais.has(m.codigo));
    const alteradas = lista.filter((m) => {
      const a = atuais.get(m.codigo);
      return a && (nomePadrao(a.nome) !== nomePadrao(m.nome) || a.uf !== m.uf);
    });
    if (novas.length) {
      await db.query(
        `insert into cidades (codigo, codigo_ibge, nome, uf)
         select (select coalesce(max(codigo), 0) from cidades) + row_number() over (order by x.ibge), x.ibge, x.nome, x.uf
           from unnest($1::int[], $2::text[], $3::text[]) as x(ibge, nome, uf)`,
        [novas.map((m) => m.codigo), novas.map((m) => nomePadrao(m.nome)), novas.map((m) => m.uf)]);
    }
    if (alteradas.length) {
      await db.query(
        `update cidades c set nome = x.nome, uf = x.uf, seq = nextval('sync_seq'), atualizado_em = now()
           from unnest($1::int[], $2::text[], $3::text[]) as x(ibge, nome, uf) where c.codigo_ibge = x.ibge`,
        [alteradas.map((m) => m.codigo), alteradas.map((m) => nomePadrao(m.nome)), alteradas.map((m) => m.uf)]);
    }
    const res = { lidas: lista.length, novas: novas.length, alteradas: alteradas.length };
    await db.query('insert into cidades_cargas (origem, duracao_ms, lidas, novas, alteradas) values ($1,$2,$3,$4,$5)',
      ['ibge', Date.now() - inicio, res.lidas, res.novas, res.alteradas]);
    return res;
  } catch (e) {
    await db.query('insert into cidades_cargas (origem, duracao_ms, erro) values ($1,$2,$3)', ['ibge', Date.now() - inicio, (e as Error).message]).catch(() => undefined);
    throw e;
  }
}
