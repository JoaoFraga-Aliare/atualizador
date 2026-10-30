'use client';
import { createTheme } from '@mui/material/styles';

const border = '#e4e8ee',
  shadow = '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#34bdcf', dark: '#1f8e9d', light: '#e3f6f9', contrastText: '#fff' },
    secondary: { main: '#475467' },
    background: { default: '#f4f6f9', paper: '#fff' },
    text: { primary: '#101828', secondary: '#667085' },
    divider: border,
    error: { main: '#d92d20' },
    success: { main: '#177a52' },
    warning: { main: '#dc6803' },
    info: { main: '#1570ef' }
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: 'Inter,"Segoe UI",system-ui,-apple-system,Arial,sans-serif',
    h4: { fontSize: '1.75rem', lineHeight: 1.2, fontWeight: 700, letterSpacing: '-.025em' },
    h6: { fontWeight: 650, letterSpacing: '-.01em' },
    button: { fontWeight: 600 }
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: { body: { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' } }
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { backgroundImage: 'none', border: `1px solid ${border}`, boxShadow: shadow } }
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(255,255,255,.85)',
          backdropFilter: 'blur(10px)',
          border: 'none',
          borderBottom: `1px solid ${border}`,
          boxShadow: 'none'
        }
      }
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { minHeight: 38, borderRadius: 8, textTransform: 'none', transition: 'all .15s ease' },
        containedPrimary: { boxShadow: '0 1px 2px rgba(16,24,40,.12)', '&:hover': { backgroundColor: '#1f8e9d' } }
      }
    },
    MuiIconButton: { styleOverrides: { root: { borderRadius: 8 } } },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiFormControl: { defaultProps: { size: 'small' } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          backgroundColor: '#fff',
          '& fieldset': { borderColor: '#d0d5dd' },
          '&:hover fieldset': { borderColor: '#98a2b3' },
          '&.Mui-focused': { boxShadow: '0 0 0 4px rgba(23,122,82,.14)' }
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: { height: 26, borderRadius: 999, fontWeight: 600, backgroundColor: '#f2f4f7', color: '#344054' }
      }
    },
    MuiDialog: {
      styleOverrides: { paper: { borderRadius: 14, boxShadow: '0 24px 56px rgba(16,24,40,.18)' } }
    },
    MuiDialogTitle: { styleOverrides: { root: { fontWeight: 650, letterSpacing: '-.01em' } } },
    MuiMenu: {
      styleOverrides: {
        paper: { borderRadius: 12, marginTop: 6, boxShadow: '0 12px 32px rgba(16,24,40,.14)' }
      }
    },
    MuiMenuItem: { styleOverrides: { root: { borderRadius: 6, margin: '2px 6px' } } },
    MuiTabs: {
      styleOverrides: {
        root: { borderBottom: `1px solid ${border}`, paddingInline: 12 },
        indicator: { height: 3, borderRadius: '3px 3px 0 0' }
      }
    },
    MuiTab: { styleOverrides: { root: { minHeight: 52, textTransform: 'none', fontWeight: 600 } } },
    MuiTooltip: { styleOverrides: { tooltip: { backgroundColor: '#101828', borderRadius: 6, fontSize: 12 } } },
    MuiAlert: { styleOverrides: { root: { borderRadius: 10 } } }
  }
});
