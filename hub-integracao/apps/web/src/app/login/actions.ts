'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE, ErroApi, loginApi } from '@/lib/api';

export type EstadoLogin = { erro?: string };

export async function entrar(_: EstadoLogin, dados: FormData): Promise<EstadoLogin> {
  try {
    const token = await loginApi(String(dados.get('email') ?? ''), String(dados.get('senha') ?? ''));
    // Secure so quando a requisicao veio por HTTPS (em http://localhost o navegador descartaria o cookie).
    const h = await headers();
    const https = h.get('x-forwarded-proto') === 'https' || (h.get('origin') ?? '').startsWith('https:');
    (await cookies()).set(COOKIE, token, {
      httpOnly: true, sameSite: 'lax', secure: https,
      path: '/', maxAge: 60 * 60 * 12,
    });
  } catch (e) {
    return { erro: e instanceof ErroApi ? e.message : 'Não foi possível entrar.' };
  }
  redirect('/tenants');
}

export async function sair() {
  (await cookies()).delete(COOKIE);
  redirect('/login');
}
