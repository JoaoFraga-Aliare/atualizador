import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { COOKIE, api } from '@/lib/api';
import { Shell } from '@/components/Shell';
import { theme } from './theme';
import { sair } from './login/actions';
import './globals.css';

export const metadata: Metadata = { title: 'Hub de Integração', description: 'Gerencial e documentação do Hub' };

type Me = { usuario: { nome: string; is_super: boolean } };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const logado = Boolean((await cookies()).get(COOKIE));
  // Sem sessão válida api() redireciona ao login; a própria página de login não usa o Shell.
  const me = logado ? await api<Me>('/v1/me').catch(() => null) : null;

  return (
    <html lang="pt-BR">
      <body>
        <AppRouterCacheProvider>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            {me ? (
              <Shell nome={me.usuario.nome} papel={me.usuario.is_super ? 'Administrador do Hub' : 'Usuário'} sair={sair}>
                {children}
              </Shell>
            ) : (
              children
            )}
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
