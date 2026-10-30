// CNPJ: so digitos (14) com os dois digitos verificadores conferidos.
export const onlyDigits = value => String(value ?? '').replace(/\D/g, '');

export function validCnpj(value) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const check = length => {
    let sum = 0,
      weight = length - 7;
    for (let i = 0; i < length; i++) {
      sum += Number(cnpj[i]) * weight--;
      if (weight < 2) weight = 9;
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return check(12) === Number(cnpj[12]) && check(13) === Number(cnpj[13]);
}

// Consulta publica (BrasilAPI por padrao; CNPJ_LOOKUP_URL troca o servico, ex.: em testes).
export async function lookupCnpj(value, base = process.env.CNPJ_LOOKUP_URL || 'https://brasilapi.com.br/api/cnpj/v1') {
  const cnpj = onlyDigits(value);
  let response;
  try {
    response = await fetch(`${base.replace(/\/$/, '')}/${cnpj}`, { signal: AbortSignal.timeout(10000) });
  } catch {
    return { status: 502, error: 'cnpj_lookup_unavailable' };
  }
  if (response.status === 404 || response.status === 400) return { status: 404, error: 'cnpj_not_found' };
  if (!response.ok) return { status: 502, error: 'cnpj_lookup_unavailable' };
  const d = await response.json().catch(() => null);
  if (!d) return { status: 502, error: 'cnpj_lookup_unavailable' };
  return {
    status: 200,
    data: {
      document: cnpj,
      legalName: d.razao_social || '',
      tradeName: d.nome_fantasia || '',
      email: String(d.email || '').toLowerCase(),
      phone: String(d.ddd_telefone_1 || '').trim(),
      city: d.municipio || '',
      state: d.uf || '',
      status: d.descricao_situacao_cadastral || ''
    }
  };
}
