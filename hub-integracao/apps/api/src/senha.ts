import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

const N = 16384;

function scrypt(senha: string, sal: Buffer, len: number): Promise<Buffer> {
  return new Promise((res, rej) =>
    scryptCb(senha, sal, len, { N, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))));
}

export async function hashSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const chave = await scrypt(senha, sal, 64);
  return `scrypt$${N}$${sal.toString('base64')}$${chave.toString('base64')}`;
}

export async function confereSenha(senha: string, hash: string | null): Promise<boolean> {
  if (!hash) return false;
  const [alg, , sal, chave] = hash.split('$');
  if (alg !== 'scrypt' || !sal || !chave) return false;
  const esperada = Buffer.from(chave, 'base64');
  const calculada = await scrypt(senha, Buffer.from(sal, 'base64'), esperada.length);
  return timingSafeEqual(esperada, calculada);
}
