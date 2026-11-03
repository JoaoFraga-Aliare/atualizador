import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { criarPool } from './db.js';
import { migrar } from './migrate.js';
import { hashSenha } from './senha.js';

// Cria o administrador do Hub (idempotente). HUB_ADMIN_EMAIL / HUB_ADMIN_PASSWORD.
const email = process.env.HUB_ADMIN_EMAIL;
const senha = process.env.HUB_ADMIN_PASSWORD;
if (!email || !senha || senha.length < 10) throw new Error('Defina HUB_ADMIN_EMAIL e HUB_ADMIN_PASSWORD (min. 10 caracteres).');
const db = criarPool(config().databaseUrl);
await migrar(db);
const ex = await db.query('select id from users where lower(email) = lower($1)', [email]);
if (ex.rowCount) console.log('administrador ja existe');
else {
  const id = randomUUID();
  await db.query('insert into users (id, email, nome, senha_hash, is_super) values ($1,$2,$3,$4,true)', [id, email, 'Administrador', await hashSenha(senha)]);
  await db.query('insert into identities (id, user_id, provider, subject) values ($1,$2,$3,$4)', [randomUUID(), id, 'password', email.toLowerCase()]);
  console.log('administrador criado');
}
await db.end();
