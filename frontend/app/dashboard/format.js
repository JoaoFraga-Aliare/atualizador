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

// CNPJ/CPF com mascara para exibir (14 digitos = CNPJ, 11 = CPF); outro valor volta como veio.
export function formatDocument(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 14) return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (digits.length === 11) return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return String(value ?? '');
}

// Mascara de CNPJ enquanto digita (00.000.000/0000-00).
export function maskCnpjInput(value) {
  const d = String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, 14);
  const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 8), d.slice(8, 12), d.slice(12, 14)];
  return [
    parts[0],
    parts[1] && '.' + parts[1],
    parts[2] && '.' + parts[2],
    parts[3] && '/' + parts[3],
    parts[4] && '-' + parts[4]
  ]
    .filter(Boolean)
    .join('');
}
