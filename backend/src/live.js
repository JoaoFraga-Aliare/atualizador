import proxyaddr from 'proxy-addr';
import { WebSocketServer } from 'ws';
import { sameSecret } from './auth.js';
import { textValue } from './lib/util.js';
import { normalizeKeyTerminalId } from './lib/error-crypto.js';

// Canal ao vivo com os terminais (WebSocket /api/v1/live).
export function createLive(db) {
  const liveTerminals = new Map();
  function liveKey(value) {
    return normalizeKeyTerminalId(value);
  }
  function sendLiveCommand(terminalExternalId, command, payload = {}) {
    const item = liveTerminals.get(liveKey(terminalExternalId));
    if (!item || item.ws.readyState !== 1) return false;
    item.ws.send(JSON.stringify({ kind: 'command', command, payload, createdAt: new Date().toISOString() }));
    return true;
  }
  function saveLiveEvent({ terminalId, type, name, operation, value, ip }) {
    const key = liveKey(terminalId),
      terminal = key ? db.prepare('SELECT id FROM terminal WHERE lower(trim(external_id))=?').get(key) : null,
      safeType = ['text', 'json'].includes(String(type)) ? String(type) : 'text',
      safeName = textValue(name) || 'Evento',
      safeOperation = textValue(operation) || 'geral',
      safeValue = typeof value === 'string' ? value : JSON.stringify(value ?? null);
    const result = db
      .prepare('INSERT INTO terminal_live_event(terminal_id,type,name,operation,value_text,ip) VALUES(?,?,?,?,?,?)')
      .run(terminal?.id || null, safeType, safeName, safeOperation, safeValue, ip || null);
    return {
      id: Number(result.lastInsertRowid),
      terminalId: key,
      type: safeType,
      name: safeName,
      operation: safeOperation
    };
  }
  return { liveTerminals, sendLiveCommand, saveLiveEvent };
}

export function attachLiveServer(server, { app, db, liveTerminals, sendLiveCommand, saveLiveEvent }) {
  const wss = new WebSocketServer({ server, path: '/api/v1/live' });
  // Mesmo criterio do limite HTTP: so falhas de autenticacao contam, por IP real (atras do Nginx).
  const liveAuthFailures = new Map(),
    liveAuthLimit = Number(process.env.INSTALLATION_KEY_MAX_FAILURES || 30),
    liveAuthWindow = 15 * 60 * 1000;
  function liveClientIp(req) {
    try {
      return proxyaddr(req, app.get('trust proxy fn'));
    } catch {
      return req.socket.remoteAddress;
    }
  }
  function liveAuthBlocked(ip) {
    const item = liveAuthFailures.get(ip);
    if (item && item.resetAt <= Date.now()) {
      liveAuthFailures.delete(ip);
      return false;
    }
    return Boolean(item && item.count >= liveAuthLimit);
  }
  function registerLiveAuthFailure(ip) {
    const now = Date.now(),
      item = liveAuthFailures.get(ip);
    if (!item || item.resetAt <= now) liveAuthFailures.set(ip, { count: 1, resetAt: now + liveAuthWindow });
    else item.count += 1;
  }
  wss.on('connection', (ws, req) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`),
        token = url.searchParams.get('token') || (req.headers.authorization || '').replace(/^Bearer /, ''),
        terminalId = normalizeKeyTerminalId(url.searchParams.get('terminalId'));
      const ip = liveClientIp(req);
      if (liveAuthBlocked(ip)) {
        ws.close(1008, 'too_many_attempts');
        return;
      }
      if (!sameSecret(token, process.env.INSTALLATION_KEY) || !terminalId) {
        registerLiveAuthFailure(ip);
        ws.close(1008, 'unauthorized');
        return;
      }
      const terminal = db.prepare('SELECT id FROM terminal WHERE lower(trim(external_id))=?').get(terminalId);
      if (!terminal) {
        ws.close(1008, 'terminal_not_found');
        return;
      }
      liveTerminals.set(terminalId, { ws, terminalId, connectedAt: new Date() });
      ws.send(JSON.stringify({ kind: 'hello', terminalId, connectedAt: new Date().toISOString() }));
      const requested = db
        .prepare('SELECT requested_at FROM terminal_database_request WHERE terminal_id=?')
        .get(terminal.id);
      if (requested?.requested_at) sendLiveCommand(terminalId, 'request_database_backup', { terminalId });
      ws.on('message', data => {
        try {
          const message = JSON.parse(String(data));
          if (message.kind === 'event')
            saveLiveEvent({
              terminalId,
              type: message.type,
              name: message.name,
              operation: message.operation,
              value: message.value,
              ip: req.socket.remoteAddress
            });
        } catch {}
      });
      ws.on('close', () => {
        const current = liveTerminals.get(terminalId);
        if (current?.ws === ws) liveTerminals.delete(terminalId);
      });
    } catch {
      try {
        ws.close(1011, 'internal_error');
      } catch {}
    }
  });
  setInterval(() => {
    for (const item of liveTerminals.values()) if (item.ws.readyState === 1) item.ws.ping();
    const now = Date.now();
    for (const [ip, item] of liveAuthFailures) if (item.resetAt <= now) liveAuthFailures.delete(ip);
  }, 30000).unref();
}
