import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { theme } from './theme';
import './styles.css';
export const metadata = {
  title: 'Hub Central',
  description: 'Hub de integração e distribuição de atualizações',
  icons: { icon: '/favicon.ico', shortcut: '/favicon.ico' }
};
export default function Layout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <AppRouterCacheProvider>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            {children}
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
