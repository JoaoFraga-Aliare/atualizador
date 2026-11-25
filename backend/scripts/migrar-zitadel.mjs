// Migra os usuarios do login local (tabela app_user) para o Zitadel, mantendo login, perfil, produtos, canais e a SENHA
// (o hash scrypt e importado como esta: ninguem precisa trocar a senha). Usuarios do Hub (hub_role) nao sao migrados.
//
//   node --env-file=.env scripts/migrar-zitadel.mjs            # simulacao: so mostra o que faria
//   node --env-file=.env scripts/migrar-zitadel.mjs --aplicar  # cria no Zitadel
//
// Antes: suba a API uma vez com AUTH_MODO=ambos (ela publica as permissoes na central) e tenha o token de gestao do
// Zitadel (o mesmo .credenciais/central.pat da central). Pode rodar de novo: quem ja existe so tem as roles somadas.
// Variaveis: DATABASE_URL, ZITADEL_URL, ZITADEL_PAT_FILE (ou ZITADEL_PAT), ZITADEL_PROJETO_ID (ou ZITADEL_CREDENCIAIS),
// ZITADEL_APP_ID (atualizador), MIGRACAO_DOMINIO_EMAIL (padrao agrosys.local: usuarios locais nao tem e-mail).
import fs from 'node:fs';
import pg from 'pg';
import { roleSlug } from '../src/zitadel.js';

const BASE = String(process.env.ZITADEL_URL ?? 'http://localhost:8080').replace(/\/+$/, '');
const APP = process.env.ZITADEL_APP_ID ?? 'atualizador';
const DOMAIN = process.env.MIGRACAO_DOMINIO_EMAIL ?? 'agrosys.local';
const apply = process.argv.includes('--aplicar');

// O Atualizador guarda "<salt em hex>:<hash em hex>", mas usa o TEXTO do salt (os 32 caracteres hex) na derivacao scrypt
// (N=16384, r=8, p=1, 64 bytes). Zitadel: $scrypt$ln=14,r=8,p=1$<salt>$<hash> (base64 sem padding).
export function hashToZitadel(stored) {
  const [salt, hash] = String(stored ?? '').split(':');
  if (!salt || !/^[0-9a-f]+$/i.test(hash ?? '')) throw new Error('hash de senha em formato desconhecido');
  const b64 = buffer => buffer.toString('base64').replace(/=+$/, '');
  return `$scrypt$ln=14,r=8,p=1$${b64(Buffer.from(salt, 'utf8'))}$${b64(Buffer.from(hash, 'hex'))}`;
}

export function rolesOf(user, productCodes, channels) {
  if (user.role === 'admin') return ['admin'];
  return [...channels.map(channel => `canal.${channel}`), ...productCodes.map(code => `produto.${roleSlug(code)}`)];
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) await main();

async function main() {
  let projectId = process.env.ZITADEL_PROJETO_ID;
  if (!projectId && process.env.ZITADEL_CREDENCIAIS) projectId = JSON.parse(fs.readFileSync(process.env.ZITADEL_CREDENCIAIS, 'utf8')).projetoId;
  const pat = process.env.ZITADEL_PAT ?? (process.env.ZITADEL_PAT_FILE ? fs.readFileSync(process.env.ZITADEL_PAT_FILE, 'utf8').trim() : '');
  if (!projectId || !pat) throw new Error('Defina ZITADEL_PROJETO_ID (ou ZITADEL_CREDENCIAIS) e ZITADEL_PAT_FILE (ou ZITADEL_PAT).');
  if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL (use --env-file=.env).');

  const api = async (method, path, body) => {
    const response = await fetch(`${BASE}/management/v1${path}`, {
      method,
      headers: { authorization: `Bearer ${pat}`, 'content-type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text}`);
    return text ? JSON.parse(text) : {};
  };

  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const users = (await db.query('SELECT id,username,name,password_hash,role,active FROM app_user WHERE hub_role IS NULL ORDER BY id')).rows;
    const existingRoles = new Set(
      ((await api('POST', `/projects/${projectId}/roles/_search`, { query: { limit: 1000 } })).result ?? []).map(r => r.key)
    );
    console.log(apply ? 'APLICANDO a migracao no Zitadel\n' : 'SIMULACAO (nada sera criado; use --aplicar)\n');
    let toCreate = 0,
      already = 0,
      skipped = 0;
    for (const user of users) {
      if (!user.active) {
        console.log(`- ${user.username}: inativo, nao migrado`);
        skipped++;
        continue;
      }
      if (String(user.password_hash).startsWith('!')) {
        console.log(`- ${user.username}: conta criada pelo Zitadel (sem senha local), nao precisa migrar`);
        skipped++;
        continue;
      }
      const codes = (
        await db.query('SELECT p.code FROM user_product up JOIN product p ON p.id=up.product_id WHERE up.user_id=$1 ORDER BY p.code', [user.id])
      ).rows.map(r => r.code);
      const channels = (await db.query('SELECT channel FROM user_channel WHERE user_id=$1 ORDER BY channel', [user.id])).rows.map(r => r.channel);
      const roles = rolesOf(user, codes, channels).map(key => `${APP}:${key}`);
      const missing = roles.filter(key => !existingRoles.has(key));
      if (missing.length) console.warn(`  aviso: ${user.username}: roles que ainda nao existem no Zitadel (suba a API em AUTH_MODO=ambos): ${missing.join(', ')}`);
      const valid = roles.filter(key => existingRoles.has(key));

      const found = (
        await api('POST', '/users/_search', { queries: [{ userNameQuery: { userName: user.username, method: 'TEXT_QUERY_METHOD_EQUALS' } }] })
      ).result ?? [];
      let id = found[0]?.id;
      console.log(`- ${user.username} (${user.role}): ${id ? 'ja existe no Zitadel' : 'sera criado'}; roles: ${valid.map(k => k.slice(APP.length + 1)).join(', ') || '(nenhuma)'}`);
      id ? already++ : toCreate++;
      if (!apply) continue;

      if (!id) {
        const names = String(user.name).trim().split(/\s+/);
        id = (
          await api('POST', '/users/human/_import', {
            userName: user.username,
            profile: { firstName: names[0], lastName: names.slice(1).join(' ') || '-', displayName: user.name },
            email: { email: `${user.username}@${DOMAIN}`, isEmailVerified: true },
            hashedPassword: { value: hashToZitadel(user.password_hash) },
            passwordChangeRequired: false
          })
        ).userId;
      }
      if (!valid.length) continue;
      const grant = ((await api('POST', '/users/grants/_search', { queries: [{ userIdQuery: { userId: id } }, { projectIdQuery: { projectId } }] })).result ?? [])[0];
      const union = [...new Set([...(grant?.roleKeys ?? []), ...valid])];
      if (!grant) await api('POST', `/users/${id}/grants`, { projectId, roleKeys: union });
      else if (union.length !== grant.roleKeys.length) await api('PUT', `/users/${id}/grants/${grant.id}`, { roleKeys: union });
    }
    console.log(`\n${apply ? 'Feito' : 'Simulado'}: ${toCreate} a criar, ${already} ja existiam, ${skipped} pulados.`);
    if (!apply) console.log('Rode de novo com --aplicar para criar.');
  } finally {
    await db.end();
  }
}
