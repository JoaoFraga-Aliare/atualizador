import { debugEnabled, debugRequest } from './debug-data';
// A sessao vai no cookie httpOnly definido no login; o navegador o envia sozinho.
function sessionExpired() {
  localStorage.removeItem('allowedChannels');
  location.href = '/';
  throw new Error('Sessão expirada');
}

export async function api(path, options = {}) {
  if (debugEnabled()) return debugRequest(path, options);
  const response = await fetch(`/api/v1${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers
    }
  });
  if (response.status === 401) sessionExpired();
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Falha na requisição');
  }
  return response.json();
}

export async function apiBlob(path) {
  if (debugEnabled()) throw new Error('Indisponível no modo debug');
  const response = await fetch(`/api/v1${path}`, { credentials: 'same-origin' });
  if (response.status === 401) sessionExpired();
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Falha na requisição');
  }
  return response.blob();
}
