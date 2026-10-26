'use client';
import { createTheme } from '@mui/material/styles';
export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#334155', dark: '#1e293b', contrastText: '#fff' },
    secondary: { main: '#64748b' },
    background: { default: '#f5f6f8', paper: '#fff' },
    text: { primary: '#20252c', secondary: '#68717d' },
    divider: '#e5e8ec',
    error: { main: '#b42318' },
    success: { main: '#287a56' }
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: 'Inter,"Segoe UI",Arial,sans-serif',
    h4: { fontSize: '1.75rem', lineHeight: 1.25, fontWeight: 650, letterSpacing: '-.025em' },
    h6: { fontWeight: 650, letterSpacing: '-.01em' },
    button: { fontWeight: 600 }
  },
  components: {
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { backgroundImage: 'none', border: '1px solid #e5e8ec' } }
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { minHeight: 38, borderRadius: 6, textTransform: 'none' } }
    },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiFormControl: { defaultProps: { size: 'small' } },
    MuiChip: {
      styleOverrides: { root: { height: 26, borderRadius: 5, backgroundColor: '#f1f3f5', color: '#475569' } }
    },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 10, boxShadow: '0 20px 45px rgba(15,23,42,.14)' } } },
    MuiTab: { styleOverrides: { root: { minHeight: 48, textTransform: 'none', fontWeight: 600 } } }
  }
});
