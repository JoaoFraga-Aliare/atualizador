export const allChannels = ['test', 'beta', 'production'];

// Canais liberados ao usuario logado, gravados ao carregar o painel (/admin/me).
export function allowedChannels() {
  try {
    const stored = JSON.parse(localStorage.getItem('allowedChannels'));
    return Array.isArray(stored) ? allChannels.filter(channel => stored.includes(channel)) : allChannels;
  } catch {
    return allChannels;
  }
}

export function storeAllowedChannels(me) {
  localStorage.setItem('allowedChannels', JSON.stringify(me.scopes?.all ? allChannels : me.scopes?.channels || []));
}

export const channels = { map: callback => allowedChannels().map(callback) };

export const channelColors = { production: '#2e7d32', beta: '#1976d2', test: '#7b1fa2' };

export const fmt = v => (v ? new Date(v.includes('T') ? v : v.replace(' ', 'T') + 'Z').toLocaleString('pt-BR') : '-');

export const fmtDay = v => (v ? new Date(v + 'T12:00:00').toLocaleDateString('pt-BR') : '-');
