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
  const data = await response.json();
  if (path === '/admin/me') {
    const allowed = data.scopes?.all ? ['test', 'beta', 'production'] : data.scopes?.channels || [];
    localStorage.setItem('allowedChannels', JSON.stringify(allowed));
  }
  if (/^\/admin\/releases\/\d+\/details$/.test(path))
    data.version = `${data.version} — By ${data.published_by_name || 'Não informado'}`;
  return data;
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
