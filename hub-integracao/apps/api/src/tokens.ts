import { SignJWT, jwtVerify } from 'jose';

// A API so conhece o JWT do Hub, nao o jeito como o usuario entrou. Quando o SSO
// chegar, o callback OIDC resolve a identidade e emite este mesmo token.
export type TokenUsuario = { tipo: 'usuario'; sub: string; super: boolean };

const chave = (segredo: string) => new TextEncoder().encode(segredo);

export function emitirUsuario(segredo: string, userId: string, isSuper: boolean) {
  return new SignJWT({ tipo: 'usuario', super: isSuper })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(userId)
    .setIssuedAt().setExpirationTime('12h').sign(chave(segredo));
}

export async function verificar(segredo: string, token: string): Promise<TokenUsuario> {
  const { payload } = await jwtVerify(token, chave(segredo), { algorithms: ['HS256'] });
  if (payload.tipo === 'usuario') return { tipo: 'usuario', sub: String(payload.sub), super: payload.super === true };
  throw new Error('token invalido');
}
