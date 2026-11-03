import { randomUUID } from 'node:crypto';
import { entidades, hashLinha, chaveDaLinha, type NomeEntidade } from '@hub/contracts';
import type { Db } from './db.js';

export type EntidadeDef = (typeof entidades)[NomeEntidade];
export type Invalida = { indice: number; erro: unknown };
export type Situacao = 'criado' | 'alterado' | 'inalterado';
export type Registro = { chave: string; id: string; situacao: Situacao };

export const entidadePorNome = (nome: string): EntidadeDef | undefined =>
  Object.values(entidades).find((x) => x.nome === nome);

// Valida, calcula chave e hash e grava so o que mudou (upsert por hash). Com `estrito`, uma
// linha invalida recusa o lote inteiro (API do cliente); sem ele as invalidas sao contadas e
// ignoradas (dados vindos do ERP: nao travar a carga por uma linha ruim).
// Devolve o id do registro (estavel: nasce na primeira gravacao) e se foi criado, alterado ou igual.
// Salvar de novo um registro excluido o traz de volta (e conta como alterado).
export async function ingerir(
  db: Db, tenantId: string, ent: EntidadeDef, linhas: Record<string, unknown>[], estrito: boolean, opcoes: { teste?: boolean } = {},
): Promise<{ recebidas: number; mudadas: number; iguais: number; invalidas: Invalida[]; registros: Registro[] }> {
  const porChave = new Map<string, { dados: Record<string, unknown>; hash: string }>();
  const invalidas: Invalida[] = [];
  linhas.forEach((linha, i) => {
    const r = ent.schema.safeParse(linha);
    if (!r.success) { invalidas.push({ indice: i, erro: r.error.issues.slice(0, 3) }); return; }
    try {
      const dados = r.data as Record<string, unknown>;
      porChave.set(chaveDaLinha(dados, ent.chave), { dados, hash: hashLinha(dados) });
    } catch (e) { invalidas.push({ indice: i, erro: (e as Error).message }); }
  });
  if (estrito && invalidas.length) return { recebidas: linhas.length, mudadas: 0, iguais: 0, invalidas, registros: [] };

  const chaves = [...porChave.keys()];
  if (!chaves.length) return { recebidas: linhas.length, mudadas: 0, iguais: 0, invalidas, registros: [] };

  // xmax = 0 so nas linhas inseridas agora (ON CONFLICT DO UPDATE mantem o id existente)
  const r = await db.query(
    `insert into sync_rows (tenant_id, entidade, chave, dados, hash, id, teste)
     select $1, $2, x.chave, x.dados::jsonb, x.hash, x.id, $7::boolean
       from unnest($3::text[], $4::text[], $5::text[], $6::uuid[]) as x(chave, dados, hash, id)
     on conflict (tenant_id, entidade, chave) do update
       set dados = excluded.dados, hash = excluded.hash, seq = nextval('sync_seq'), atualizado_em = now(), excluido = false,
           teste = sync_rows.teste and excluded.teste
       where sync_rows.hash <> excluded.hash or sync_rows.excluido or (sync_rows.teste and not excluded.teste)
     returning chave, id, (xmax = 0) as criado`,
    [tenantId, ent.nome, chaves, chaves.map((k) => JSON.stringify(porChave.get(k)!.dados)),
      chaves.map((k) => porChave.get(k)!.hash), chaves.map(() => randomUUID()), opcoes.teste === true]);

  const mudou = new Map<string, Registro>(r.rows.map((x: { chave: string; id: string; criado: boolean }) =>
    [x.chave, { chave: x.chave, id: x.id, situacao: x.criado ? 'criado' : 'alterado' } as Registro]));
  const iguais = chaves.filter((k) => !mudou.has(k));
  const ids = iguais.length
    ? (await db.query('select chave, id from sync_rows where tenant_id = $1 and entidade = $2 and chave = any($3)', [tenantId, ent.nome, iguais])).rows
    : [];
  const registros: Registro[] = chaves.map((k) => mudou.get(k) ?? {
    chave: k, id: (ids as { chave: string; id: string }[]).find((x) => x.chave === k)!.id, situacao: 'inalterado',
  });
  const mudadas = mudou.size;
  return { recebidas: linhas.length, mudadas, iguais: chaves.length - mudadas, invalidas, registros };
}
