import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** AES-256-GCM. Formato guardado: iv(12) | tag(16) | texto cifrado. */
export function criarCofre(chaveBase64: string) {
  const chave = Buffer.from(chaveBase64, 'base64');
  if (chave.length !== 32) throw new Error('chave de segredos deve ter 32 bytes');
  return {
    cifrar(texto: string): Buffer {
      const iv = randomBytes(12);
      const c = createCipheriv('aes-256-gcm', chave, iv);
      const ct = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
      return Buffer.concat([iv, c.getAuthTag(), ct]);
    },
    decifrar(dado: Buffer): string {
      const d = createDecipheriv('aes-256-gcm', chave, dado.subarray(0, 12));
      d.setAuthTag(dado.subarray(12, 28));
      return Buffer.concat([d.update(dado.subarray(28)), d.final()]).toString('utf8');
    },
  };
}

export type Cofre = ReturnType<typeof criarCofre>;
