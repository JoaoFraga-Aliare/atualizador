import { readCookie, setSessionCookie } from '../sessions.js';

export const ID_TOKEN_COOKIE = 'central_idt';
// Endereco que o navegador usa (o painel Next encaminha /api e manda o host original em x-forwarded-host).
export const originOf = req => `${req.get('x-forwarded-proto') || req.protocol}://${req.get('x-forwarded-host') || req.get('host')}`;
const idTokenCookieOptions = req => ({ httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/' });

// Login pelo Zitadel (so existe com AUTH_MODO=ambos|zitadel). O usuario do Zitadel vira (ou atualiza) uma linha em app_user,
// com produtos e canais vindos das roles do token: assim todo o resto do painel (escopos, tokens de CI, sessoes) segue igual.
export function registerZitadelRoutes(app, ctx) {
  const { db, sessions, zitadel, loginIpLimiter } = ctx;

  // O painel pergunta quais logins estao ligados para desenhar a tela de entrada.
  app.get('/api/v1/auth/modes', (_req, res) => res.json({ local: zitadel.allowLocal, zitadel: zitadel.enabled }));
  if (!zitadel.configured) return;

  // as rotas existem desde o boot; antes do registro na central terminar, devolvem o usuario para o login com um aviso
  const notReady = res => res.redirect(`/?erro=${encodeURIComponent('O login pelo Zitadel ainda esta sendo configurado. Tente em instantes.')}`);
  app.get('/api/v1/auth/zitadel/login', loginIpLimiter, (req, res) =>
    zitadel.enabled ? res.redirect(zitadel.loginUrl(req.query.voltar, originOf(req))) : notReady(res)
  );

  app.get('/api/v1/auth/zitadel/callback', loginIpLimiter, async (req, res) => {
    if (!zitadel.enabled) return notReady(res);
    try {
      const result = await zitadel.finishLogin(String(req.query.code || ''), String(req.query.state || ''));
      const products = await db.prepare('SELECT id,code FROM product WHERE active=1').all();
      const access = await zitadel.accessFromRoles(result.roles, products);

      const user = await db.transaction(async tdb => {
        let row = await tdb.prepare('SELECT * FROM app_user WHERE username=? AND hub_role IS NULL').get(result.login);
        const role = access.admin ? 'admin' : 'operator';
        if (!row) {
          // senha sem formato valido: essa conta so entra pelo Zitadel
          const created = await tdb
            .prepare('INSERT INTO app_user(username,name,password_hash,role) VALUES(?,?,?,?) RETURNING id')
            .run(result.login, result.name, '!zitadel', role);
          row = await tdb.prepare('SELECT * FROM app_user WHERE id=?').get(created.lastInsertRowid);
        } else {
          if (!row.active) throw new Error('Usuario desativado neste painel.');
          await tdb.prepare('UPDATE app_user SET name=?,role=? WHERE id=?').run(result.name, role, row.id);
        }
        await tdb.prepare('DELETE FROM user_product WHERE user_id=?').run(row.id);
        await tdb.prepare('DELETE FROM user_channel WHERE user_id=?').run(row.id);
        for (const productId of access.productIds)
          await tdb.prepare('INSERT INTO user_product(user_id,product_id) VALUES(?,?)').run(row.id, productId);
        for (const channel of access.channels)
          await tdb.prepare('INSERT INTO user_channel(user_id,channel) VALUES(?,?)').run(row.id, channel);
        return row;
      })();

      setSessionCookie(req, res, await sessions.create(user, req));
      if (result.idToken) res.cookie(ID_TOKEN_COOKIE, result.idToken, idTokenCookieOptions(req));
      res.redirect(result.back);
    } catch (error) {
      res.redirect(`/?erro=${encodeURIComponent(error.message)}`);
    }
  });
}

// Chamado pelo logout: quem entrou pelo Zitadel tambem encerra a sessao SSO de la.
export function zitadelLogoutUrl(req, res, zitadel) {
  const idToken = readCookie(req, ID_TOKEN_COOKIE);
  if (!zitadel.enabled || !idToken) return undefined;
  res.clearCookie(ID_TOKEN_COOKIE, idTokenCookieOptions(req));
  return zitadel.logoutUrl(idToken, originOf(req));
}
