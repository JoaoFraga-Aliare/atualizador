import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

export const SESSION_COOKIE = 'central_session';
const SESSION_HOURS = 8;

export function readCookie(req, name) {
  for (const part of String(req.get('cookie') || '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return '';
      }
    }
  }
  return '';
}

const cookieOptions = req => ({ httpOnly: true, sameSite: 'strict', secure: req.secure, path: '/' });

export function setSessionCookie(req, res, token) {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(req), maxAge: SESSION_HOURS * 3600 * 1000 });
}

export function clearSessionCookie(req, res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions(req));
}

// Sessoes do painel: o JWT carrega o id da sessao, que pode ser revogada antes de expirar.
export function createSessions(db) {
  function create(user, req) {
    const id = crypto.randomUUID(),
      expiresAt = new Date(Date.now() + SESSION_HOURS * 3600 * 1000).toISOString();
    db.prepare('INSERT INTO admin_session(id,user_id,expires_at,ip,user_agent) VALUES(?,?,?,?,?)').run(
      id,
      user.id,
      expiresAt,
      req.ip || null,
      String(req.get('user-agent') || '').slice(0, 300)
    );
    return jwt.sign({ sub: user.id, sid: id }, process.env.JWT_SECRET, { expiresIn: `${SESSION_HOURS}h` });
  }

  function verify(token) {
    const payload = jwt.verify(String(token || ''), process.env.JWT_SECRET);
    const session = payload.sid
      ? db
          .prepare('SELECT id FROM admin_session WHERE id=? AND user_id=? AND revoked_at IS NULL AND expires_at>?')
          .get(payload.sid, payload.sub, new Date().toISOString())
      : null;
    if (!session) throw new Error('session_revoked');
    return { userId: payload.sub, sessionId: payload.sid };
  }

  const revoke = id =>
    db.prepare('UPDATE admin_session SET revoked_at=CURRENT_TIMESTAMP WHERE id=? AND revoked_at IS NULL').run(id);
  const revokeUser = userId =>
    db
      .prepare('UPDATE admin_session SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=? AND revoked_at IS NULL')
      .run(userId);

  return { create, verify, revoke, revokeUser };
}
