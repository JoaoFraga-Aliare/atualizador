import pg from 'pg';

// numeric/bigint chegam como string do driver; o Hub trata valores de negocio
// como JSON (jsonb), entao so o seq (bigint) precisa virar numero.
pg.types.setTypeParser(20, (v) => Number(v));

export type Db = pg.Pool;

export function criarPool(url: string): Db {
  return new pg.Pool({ connectionString: url, max: 10 });
}
