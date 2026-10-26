import crypto from 'node:crypto';
import { sameSecret } from './auth.js';
import { normalizeKeyTerminalId } from './lib/error-crypto.js';

const hashKey = value => crypto.createHash('sha256').update(String(value)).digest('hex');

export const bearerToken = req => (req.get('authorization') || '').replace(/^Bearer /, '');

// Identificador do terminal em qualquer rota de terminal (JSON, query ou cabecalho).
export function requestTerminalId(req) {
  const body = req.body || {};
  return (
    body.terminal?.id ??
    body.terminalId ??
    req.query?.terminalId ??
    req.query?.terminal ??
    req.query?.id ??
    req.get?.('x-terminal-id') ??
    ''
  );
}

// Chave propria de cada terminal: emitida no /updates/check enquanto o terminal usa a chave global
// e confirmada no primeiro uso. Depois de confirmada, a chave global deixa de valer para aquele
// terminal (TERMINAL_KEY_ENFORCEMENT=off mantem a global aceita durante a transicao).
export function createTerminalKeys(db) {
  const enforced = () => (process.env.TERMINAL_KEY_ENFORCEMENT || 'confirmed') !== 'off';
  const byExternalId = db.prepare(
    'SELECT id,external_id,api_key_confirmed_at FROM terminal WHERE lower(trim(external_id))=?'
  );
  const byKeyHash = db.prepare('SELECT id,external_id,api_key_confirmed_at FROM terminal WHERE api_key_hash=?');

  function authenticate(token, terminalId) {
    const identified = normalizeKeyTerminalId(terminalId);
    if (sameSecret(token, process.env.INSTALLATION_KEY)) {
      const terminal = identified ? byExternalId.get(identified) : null;
      if (terminal?.api_key_confirmed_at && enforced())
        return { ok: false, status: 401, error: 'terminal_key_required' };
      return { ok: true, type: 'global', terminal: terminal || null };
    }
    const terminal = token ? byKeyHash.get(hashKey(token)) : null;
    if (!terminal) return { ok: false, status: 401, error: 'invalid_installation_key' };
    if (identified && identified !== normalizeKeyTerminalId(terminal.external_id))
      return { ok: false, status: 403, error: 'terminal_mismatch' };
    if (!terminal.api_key_confirmed_at)
      db.prepare('UPDATE terminal SET api_key_confirmed_at=CURRENT_TIMESTAMP WHERE id=?').run(terminal.id);
    return { ok: true, type: 'terminal', terminal };
  }

  // Nova chave a cada consulta ate o terminal confirmar uma delas usando-a.
  function issueKey(terminalId) {
    const row = db.prepare('SELECT api_key_confirmed_at FROM terminal WHERE id=?').get(terminalId);
    if (!row || row.api_key_confirmed_at) return null;
    const key = `tk_${crypto.randomBytes(32).toString('base64url')}`;
    db.prepare('UPDATE terminal SET api_key_hash=?,api_key_issued_at=CURRENT_TIMESTAMP WHERE id=?').run(
      hashKey(key),
      terminalId
    );
    return key;
  }

  function resetKey(terminalId) {
    db.prepare('UPDATE terminal SET api_key_hash=NULL,api_key_issued_at=NULL,api_key_confirmed_at=NULL WHERE id=?').run(
      terminalId
    );
  }

  return { authenticate, issueKey, resetKey };
}

// Remove o hash da chave e informa a situacao para o painel.
export function publicTerminal(row) {
  if (!row) return row;
  const { api_key_hash: keyHash, ...terminal } = row;
  return {
    ...terminal,
    terminal_key_status: row.api_key_confirmed_at ? 'confirmed' : keyHash ? 'pending' : 'none'
  };
}
