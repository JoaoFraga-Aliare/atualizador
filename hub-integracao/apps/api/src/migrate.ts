import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './db.js';

const pasta = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');

export async function migrar(db: Db): Promise<string[]> {
  await db.query('create table if not exists _migrations (nome text primary key, aplicada_em timestamptz not null default now())');
  const feitas = new Set((await db.query('select nome from _migrations')).rows.map((r) => r.nome));
  const aplicadas: string[] = [];
  for (const arq of fs.readdirSync(pasta).filter((f) => f.endsWith('.sql')).sort()) {
    if (feitas.has(arq)) continue;
    const sql = fs.readFileSync(path.join(pasta, arq), 'utf8');
    const c = await db.connect();
    try {
      await c.query('begin');
      await c.query(sql);
      await c.query('insert into _migrations (nome) values ($1)', [arq]);
      await c.query('commit');
      aplicadas.push(arq);
    } catch (e) {
      await c.query('rollback');
      throw new Error(`migracao ${arq} falhou: ${(e as Error).message}`);
    } finally {
      c.release();
    }
  }
  return aplicadas;
}
