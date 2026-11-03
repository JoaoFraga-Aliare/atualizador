import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import forge from 'node-forge';

// Certificado digital A1 da empresa. O .pfx e a senha ficam cifrados (envelope); a chave-mestra vem do
// ambiente (HUB_CERT_MASTER_KEY, base64 ou hex de 32 bytes) ou de um arquivo (HUB_CERT_KEY_FILE) e nunca
// entra no banco. Sem chave-mestra os recursos de certificado ficam indisponiveis (503), nunca em claro.

export class ErroCertificado extends Error {
  constructor(public status: number, public codigo: string, mensagem: string) { super(mensagem); }
}

export function chaveMestra(): Buffer {
  const bruto = (process.env.HUB_CERT_MASTER_KEY ?? (process.env.HUB_CERT_KEY_FILE ? readFileSync(process.env.HUB_CERT_KEY_FILE, 'utf8') : '')).trim();
  const chave = /^[0-9a-f]{64}$/i.test(bruto) ? Buffer.from(bruto, 'hex') : Buffer.from(bruto, 'base64');
  if (chave.length !== 32) {
    throw new ErroCertificado(503, 'chave_mestra_ausente', 'O Hub nao tem a chave-mestra de certificados configurada (HUB_CERT_MASTER_KEY ou HUB_CERT_KEY_FILE, 32 bytes).');
  }
  return chave;
}

// AES-256-GCM: "iv.tag.dados" em base64. `aad` amarra o valor ao dono (empresa): trocar a linha de empresa falha.
export function cifrar(plano: Buffer, chave: Buffer, aad: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', chave, iv);
  c.setAAD(Buffer.from(aad));
  const dados = Buffer.concat([c.update(plano), c.final()]);
  return [iv, c.getAuthTag(), dados].map((b) => b.toString('base64')).join('.');
}

export function decifrar(valor: string, chave: Buffer, aad: string): Buffer {
  const [iv, tag, dados] = valor.split('.').map((p) => Buffer.from(p, 'base64'));
  const d = createDecipheriv('aes-256-gcm', chave, iv);
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(dados), d.final()]);
}

export type Cifrado = { pfx: string; senha: string; chave: string };

export function cifrarCertificado(pfx: Buffer, senha: string, tenantId: string): Cifrado {
  const mestra = chaveMestra();
  const dados = randomBytes(32);
  return {
    pfx: cifrar(pfx, dados, tenantId),
    senha: cifrar(Buffer.from(senha, 'utf8'), dados, tenantId),
    chave: cifrar(dados, mestra, tenantId),
  };
}

export function decifrarCertificado(c: Cifrado, tenantId: string): { pfx: Buffer; senha: string } {
  const dados = decifrar(c.chave, chaveMestra(), tenantId);
  return { pfx: decifrar(c.pfx, dados, tenantId), senha: decifrar(c.senha, dados, tenantId).toString('utf8') };
}

// ---- leitura do .pfx ------------------------------------------------------------------------
export type Metadados = { titular: string; cnpj: string | null; serie: string; impressao: string; validoDe: Date; validoAte: Date };

const soDigitos = (t: string) => t.replace(/\D/g, '');

// ICP-Brasil: o CNPJ vem no CN ("RAZAO SOCIAL:12345678000190") e na extensao SAN (OID 2.16.76.1.3.3).
function cnpjDo(cert: forge.pki.Certificate, cn: string): string | null {
  const noCn = cn.match(/:(\d{14})\b/) ?? cn.match(/\b(\d{14})\b/);
  if (noCn) return noCn[1];
  for (const ext of cert.extensions as { name?: string; value?: string; id?: string }[]) {
    if (ext.name !== 'subjectAltName' && ext.id !== '2.5.29.17') continue;
    const bruto = typeof ext.value === 'string' ? ext.value : '';
    const pos = bruto.indexOf('\x60\x4c\x01\x03\x03');         // OID 2.16.76.1.3.3 em DER
    if (pos >= 0) { const m = bruto.slice(pos + 5).match(/\d{14}/); if (m) return m[0]; }
  }
  return null;
}

export function analisarPfx(pfx: Buffer, senha: string): Metadados {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.createBuffer(pfx.toString('binary'))), false, senha);
  } catch (e) {
    const msg = (e as Error).message ?? '';
    if (/password|MAC|decrypt/i.test(msg)) throw new ErroCertificado(422, 'senha_invalida', 'Senha do certificado invalida.');
    throw new ErroCertificado(422, 'arquivo_invalido', 'O arquivo nao e um certificado .pfx valido.');
  }
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []).map((b) => b.cert).filter((c): c is forge.pki.Certificate => !!c);
  const chaves = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ].map((b) => b.key as forge.pki.rsa.PrivateKey | undefined).filter((k): k is forge.pki.rsa.PrivateKey => !!k);
  if (!chaves.length) throw new ErroCertificado(422, 'sem_chave_privada', 'O arquivo nao tem a chave privada (envie o certificado A1 completo, .pfx).');
  // o certificado da empresa e o que casa com a chave privada (o arquivo traz tambem a cadeia)
  const cert = certs.find((c) => chaves.some((k) => (c.publicKey as forge.pki.rsa.PublicKey).n?.compareTo(k.n) === 0));
  if (!cert) throw new ErroCertificado(422, 'sem_certificado', 'Nao ha certificado correspondente a chave privada no arquivo.');
  const cn = String(cert.subject.getField('CN')?.value ?? '');
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  return {
    titular: cn, cnpj: cnpjDo(cert, cn), serie: cert.serialNumber.toLowerCase(),
    impressao: forge.md.sha1.create().update(der).digest().toHex(),
    validoDe: cert.validity.notBefore, validoAte: cert.validity.notAfter,
  };
}

// O certificado precisa ser da mesma raiz de CNPJ do emitente (matriz e filiais compartilham os 8 primeiros digitos).
export const mesmaRaizCnpj = (a: string, b: string) => soDigitos(a).slice(0, 8) === soDigitos(b).slice(0, 8);
export const diasRestantes = (ate: Date) => Math.floor((ate.getTime() - Date.now()) / 86_400_000);
