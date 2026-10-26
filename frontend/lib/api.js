export async function api(path, options = {}) {
  const token = localStorage.getItem('token');
  const response = await fetch(`/api/v1${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      Authorization: `Bearer ${token}`,
      ...options.headers
    }
  });
  if (response.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('allowedChannels');
    location.href = '/';
    throw new Error('Sessão expirada');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Falha na requisição');
  }
  return response.json();
}

export async function apiBlob(path) {
  const token = localStorage.getItem('token');
  const response = await fetch(`/api/v1${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('allowedChannels');
    location.href = '/';
    throw new Error('Sessão expirada');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Falha na requisição');
  }
  return response.blob();
}
