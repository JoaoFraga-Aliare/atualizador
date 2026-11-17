import { createHash } from 'node:crypto';

// JSON canonico: chaves ordenadas, strings aparadas, numericos como numero,
// null e undefined tratados igual (campo ausente == null). Duas linhas
// "iguais para o negocio" geram o mesmo texto e o mesmo hash.
export function canonico(valor: unknown): string {
  return JSON.stringify(normalizar(valor));
}

function normalizar(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    const s = v.trim();
    return s === '' ? null : s;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.map(normalizar);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) {
      const n = normalizar(o[k]);
      if (n !== null) out[k] = n; // ausente == null
    }
    return out;
  }
  return String(v);
}

export function hashLinha(linha: unknown): string {
  return createHash('sha256').update(canonico(linha)).digest('hex');
}

// Chave natural da linha (valores da PK separados por '|').
export function chaveDaLinha(linha: Record<string, unknown>, campos: readonly string[]): string {
  return campos.map((c) => {
    const v = linha[c];
    if (v === null || v === undefined || String(v).trim() === '') {
      throw new Error(`campo de chave ausente: ${c}`);
    }
    return String(v).trim();
  }).join('|');
}
