'use client';

import { useState, type FormEvent } from 'react';

// Esqueleto: o endpoint de login (POST /v1/auth/login, argon2 + MFA para admin geral) ainda não existe na API.
export default function Login() {
  const [mensagem, setMensagem] = useState('');

  async function entrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMensagem('Login ainda não implementado na API (próximo passo: usuários, sessão e MFA).');
  }

  return (
    <main style={{ maxWidth: 360, margin: '10vh auto' }}>
      <h1>Hub</h1>
      <form onSubmit={entrar} style={{ display: 'grid', gap: 12 }}>
        <label>E-mail <input name="email" type="email" required autoComplete="username" style={{ width: '100%' }} /></label>
        <label>Senha <input name="senha" type="password" required autoComplete="current-password" style={{ width: '100%' }} /></label>
        <button type="submit">Entrar</button>
        {mensagem && <p role="status">{mensagem}</p>}
      </form>
    </main>
  );
}
