import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { migrar } from '../src/migracoes.js';

/**
 * Sobe um Postgres real (embarcado, só para testes) e aplica as migrations como superusuário.
 * Se TEST_DATABASE_URL_DONO e TEST_DATABASE_URL_APP existirem, usa esse banco em vez do embarcado
 * (o banco deve estar vazio).
 */
export default async function setup(project: TestProject) {
  let parar = async () => {};
  let urlDono = process.env.TEST_DATABASE_URL_DONO;
  let urlApp = process.env.TEST_DATABASE_URL_APP;

  if (!urlDono || !urlApp) {
    const dir = mkdtempSync(join(tmpdir(), 'hub-pg-'));
    const porta = 54000 + Math.floor(Math.random() * 1000);
    const pgEmb = new EmbeddedPostgres({
      databaseDir: dir,
      user: 'hub_owner',
      password: 'dono_teste',
      port: porta,
      persistent: false,
      onLog: () => {},
      onError: () => {},
    });
    await pgEmb.initialise();
    await pgEmb.start();
    await pgEmb.createDatabase('hub_teste');
    urlDono = `postgres://hub_owner:dono_teste@localhost:${porta}/hub_teste`;
    urlApp = `postgres://hub_app:app_teste@localhost:${porta}/hub_teste`;
    parar = async () => {
      await pgEmb.stop();
      rmSync(dir, { recursive: true, force: true });
    };
  }

  await migrar(urlDono, fileURLToPath(new URL('../migrations', import.meta.url)), () => {});
  const c = new pg.Client({ connectionString: urlDono });
  await c.connect();
  await c.query(`ALTER ROLE hub_app LOGIN PASSWORD 'app_teste'`);
  await c.end();

  project.provide('urlDono', urlDono);
  project.provide('urlApp', urlApp);
  return parar;
}

declare module 'vitest' {
  export interface ProvidedContext {
    urlDono: string;
    urlApp: string;
  }
}
