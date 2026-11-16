import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { theme } from './theme';
import './agrosys-ui/tokens.css';
import './agrosys-ui/componentes.css';
import './styles.css';
export const metadata = {
  title: 'Hub Central',
  description: 'Hub de integração e distribuição de atualizações',
  icons: { icon: '/favicon.ico', shortcut: '/favicon.ico' }
};
export default function Layout({ children }) {
  return (
    <html lang="pt-BR">
      <body className="ag">
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
