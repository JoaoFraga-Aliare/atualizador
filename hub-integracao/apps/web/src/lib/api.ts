import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const COOKIE = 'hub_token';

const base = () => (process.env.HUB_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

export class ErroApi extends Error {
  constructor(public status: number, mensagem: string, public detalhe?: unknown) { super(mensagem); }
}

async function lerErro(r: Response): Promise<ErroApi> {
  const j = await r.json().catch(() => null) as { erro?: string; detalhe?: unknown } | null;
  return new ErroApi(r.status, j?.erro ?? `Erro ${r.status} na API.`, j?.detalhe);
}

/** Chama a API do Hub com o token da sessão; 401 manda ao login. */
export async function api<T = unknown>(
  caminho: string,
  opcoes: { method?: string; corpo?: unknown } = {},
): Promise<T> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) redirect('/login');
  let r: Response;
  try {
    r = await fetch(base() + caminho, {
      method: opcoes.method ?? 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        ...(opcoes.corpo !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new ErroApi(0, 'Não foi possível falar com a API do Hub.');
  }
  if (r.status === 401) redirect('/login');
  if (!r.ok) throw await lerErro(r);
  if (r.status === 204) return undefined as T;
  return (await r.json()) as T;
}

/** Login por senha; devolve o token do usuário. */
export async function loginApi(email: string, senha: string): Promise<string> {
  let r: Response;
  try {
    r = await fetch(base() + '/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, senha }),
      cache: 'no-store',
    });
  } catch {
    throw new ErroApi(0, 'Não foi possível falar com a API do Hub.');
  }
  if (!r.ok) throw await lerErro(r);
  return ((await r.json()) as { token: string }).token;
}

/** Mensagem para mostrar ao usuário (com os campos inválidos, quando a API os detalha). */
export function textoDoErro(e: unknown): string {
  if (!(e instanceof ErroApi)) return e instanceof Error ? e.message : 'Erro inesperado.';
  const d = Array.isArray(e.detalhe) ? e.detalhe as { campo?: string; erro?: string }[] : [];
  const campos = d.filter((x) => x && x.campo && x.erro).slice(0, 5).map((x) => `${x.campo}: ${x.erro}`);
  return campos.length ? `${e.message} ${campos.join('; ')}` : e.message;
}
