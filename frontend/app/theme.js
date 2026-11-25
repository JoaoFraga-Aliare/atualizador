'use client';
import { createTheme } from '@mui/material/styles';
import { ag } from './agrosys-tokens';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: ag.ciano, dark: ag.cianoHover, light: ag.cianoClaro, contrastText: '#fff' },
    secondary: { main: ag.navy },
    background: { default: ag.fundo, paper: ag.superficie },
    text: { primary: ag.texto, secondary: ag.textoSec, disabled: ag.textoFraco },
    divider: ag.linha,
    error: { main: ag.vermelho, light: ag.vermelhoFundo },
    success: { main: ag.verde, light: ag.verdeFundo },
    warning: { main: ag.amarelo, light: ag.amareloFundo },
    info: { main: ag.azul, light: ag.azulFundo }
  },
  // Base 4: o MUI multiplica (borderRadius: 2 => 8px), entao os cantos ficam discretos.
  shape: { borderRadius: ag.raioSm },
  typography: {
    fontFamily: ag.fonte,
    fontSize: 13.5,
    h4: { fontSize: '1.5rem', lineHeight: 1.2, fontWeight: 700, color: ag.navy, letterSpacing: '-.01em' },
    h5: { fontWeight: 700, color: ag.navy, letterSpacing: '-.01em' },
    h6: { fontWeight: 700, color: ag.navy, letterSpacing: '-.01em' },
    button: { fontWeight: 600 }
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: { body: { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' } }
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: `1px solid ${ag.linha}`,
          borderRadius: ag.raioLg,
          boxShadow: ag.sombra
        }
      }
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: ag.superficie,
          color: ag.navy,
          border: 'none',
          borderBottom: `1px solid ${ag.linha}`,
          boxShadow: 'none'
        }
      }
    },
    MuiToolbar: { styleOverrides: { root: { minHeight: '56px !important' } } },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { minHeight: 36, borderRadius: ag.raio, textTransform: 'none', fontWeight: 600 },
        containedPrimary: { '&:hover': { backgroundColor: ag.cianoHover } },
        containedSecondary: { '&:hover': { backgroundColor: ag.navyHover } },
        outlined: { borderColor: ag.bordaCampo, color: ag.navy, '&:hover': { backgroundColor: '#f3f9fb' } },
        text: { color: ag.textoSec }
      }
    },
    MuiLink: { styleOverrides: { root: { color: ag.cianoTexto } } },
    MuiIconButton: { styleOverrides: { root: { borderRadius: ag.raio } } },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiFormControl: { defaultProps: { size: 'small' } },
    MuiInputLabel: { styleOverrides: { root: { color: ag.textoSec } } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: ag.raio,
          backgroundColor: ag.superficie,
          '& fieldset': { borderColor: ag.bordaCampo },
          '&:hover fieldset': { borderColor: ag.textoFraco },
          '&.Mui-focused fieldset': { borderColor: ag.ciano },
          '&.Mui-focused': { boxShadow: '0 0 0 3px rgba(0,183,206,.18)' }
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: { height: 24, borderRadius: ag.raioSm, fontWeight: 600, backgroundColor: ag.cinzaFundo, color: ag.cinza }
      }
    },
    MuiDialog: { styleOverrides: { paper: { borderRadius: ag.raioLg, boxShadow: ag.sombraAlta } } },
    MuiDialogTitle: { styleOverrides: { root: { fontWeight: 700, color: ag.navy } } },
    MuiMenu: { styleOverrides: { paper: { borderRadius: ag.raio, marginTop: 6 } } },
    MuiMenuItem: { styleOverrides: { root: { borderRadius: ag.raioSm, margin: '2px 6px' } } },
    MuiTableCell: {
      styleOverrides: {
        head: {
          color: ag.cianoHover,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '.08em',
          textTransform: 'uppercase'
        }
      }
    },
    MuiTabs: {
      styleOverrides: {
        root: { borderBottom: `1px solid ${ag.linha}`, paddingInline: 12 },
        indicator: { height: 3, borderRadius: '3px 3px 0 0', backgroundColor: ag.ciano }
      }
    },
    MuiTab: {
      styleOverrides: {
        root: { minHeight: 48, textTransform: 'none', fontWeight: 600, '&.Mui-selected': { color: ag.navy } }
      }
    },
    MuiTooltip: {
      styleOverrides: { tooltip: { backgroundColor: ag.navyEscuro, borderRadius: ag.raioSm, fontSize: 12 } }
    },
    MuiAlert: { styleOverrides: { root: { borderRadius: ag.raioSm } } }
  }
});
