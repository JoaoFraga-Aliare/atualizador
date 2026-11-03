import { ignoradosPdvConfig2, mapaPdvConfig2, type MapaCampo } from '@hub/contracts';
import { requisicaoSegura } from './seguranca.js';
import { validarUrl } from './webhooks.js';

// Parametros do caixa que o Agrosys devolve (PDVCONFIG2) -> valores do terminal no Hub.
// O que a LN nao devolve (ou devolve em branco) nao e tocado: continua manual.

// LN consultada: PDVCONFIG (lnws-pdvconfig, 20 campos) ou PDVCONFIG2 (lnws-pdvconfig2, 92 campos). Padrao: PDVCONFIG2 (a mais completa).
export const OPERACAO_CONFIG = process.env.HUB_OPERACAO_CONFIG ?? 'PDVCONFIG2';

export type CertificadoDoAgrosys = { url: string; senha: string; nome: string };
export type Traducao = {
  valores: Record<string, string | number | boolean>;
  ignorados: { campo: string; motivo: string }[];
  certificado: CertificadoDoAgrosys | null;
  faltando: string[];            // configuracoes que o Agrosys informa nao estarem cadastradas (cai_faltando)
};

const vazio = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '' ) || v === '?';

function normalizar(c: MapaCampo, bruto: unknown): string | number | boolean | undefined {
  if (vazio(bruto)) return undefined;
  switch (c.tipo) {
    case 'booleano':
      if (typeof bruto === 'boolean') return bruto;
      return ['yes', 'true', 'sim', 's', '1'].includes(String(bruto).trim().toLowerCase());
    case 'inteiro': case 'decimal': {
      const n = typeof bruto === 'number' ? bruto : Number(String(bruto).trim().replace(',', '.'));
      return Number.isFinite(n) ? n : String(bruto);   // texto invalido segue e e recusado na validacao, com o campo
    }
    case 'data': return String(bruto).trim().slice(0, 10);
    default: {
      const t = String(bruto).trim();
      return c.digitos ? t.replace(/\D/g, '') : t;
    }
  }
}

export function traduzirPdvConfig2(linha: Record<string, unknown>): Traducao {
  const valores: Traducao['valores'] = {};
  for (const c of mapaPdvConfig2) {
    const v = normalizar(c, linha[c.de]);
    if (v !== undefined) valores[c.para] = v;
  }
  const ignorados = Object.entries(ignoradosPdvConfig2)
    .filter(([campo]) => !campo.startsWith('con_cert') && campo !== 'con_urlcertificado' && !vazio(linha[campo]))
    .map(([campo, motivo]) => ({ campo, motivo }));
  const url = vazio(linha.con_urlcertificado) ? '' : String(linha.con_urlcertificado).trim();
  const faltando = vazio(linha.cai_faltando) ? [] : String(linha.cai_faltando).split(';').map((x) => x.trim()).filter(Boolean);
  return {
    valores, ignorados, faltando,
    certificado: url ? { url, senha: String(linha.con_certsenha ?? ''), nome: vazio(linha.con_certnome) ? 'certificado.pfx' : String(linha.con_certnome).trim() } : null,
  };
}

// Baixa o .pfx pela URL que o Agrosys informa (relativa a URL do web service, se vier sem endereco). Mesmas
// protecoes dos webhooks: sem credenciais na URL, sem rede interna (salvo liberacao), sem redirecionamento e com limite.
export async function baixarCertificado(url: string, base: string): Promise<Buffer> {
  const abs = new URL(url, base || undefined).toString();
  const erro = validarUrl(abs);
  if (erro) throw new Error(`URL do certificado nao aceita: ${erro}`);
  const r = await requisicaoSegura(abs, { timeoutMs: 20_000, maxBytes: 1_000_001 });
  if (r.status < 200 || r.status >= 300) throw new Error(`Download do certificado falhou (HTTP ${r.status}).`);
  const bytes = r.corpo;
  if (bytes.length < 100 || bytes.length > 1_000_000) throw new Error('Arquivo de certificado com tamanho invalido.');
  if (bytes[0] === 0x30) return bytes;                         // .pfx (ASN.1 DER)
  const texto = bytes.toString('utf8').trim();
  if (/^[A-Za-z0-9+/=\s]+$/.test(texto)) return Buffer.from(texto, 'base64');   // enviado em base64
  throw new Error('O arquivo baixado nao parece um certificado .pfx.');
}
