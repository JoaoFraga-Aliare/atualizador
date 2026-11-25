'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, CircularProgress, IconButton, InputAdornment, TextField, Typography } from '@mui/material';
import {
  FileDownloadOutlined as DownloadIcon,
  LoginOutlined as LoginIcon,
  ShowChartOutlined as ChartIcon,
  ShieldOutlined as ShieldIcon,
  VisibilityOffOutlined as EyeOffIcon,
  VisibilityOutlined as EyeIcon
} from '@mui/icons-material';
import { syncDebugFromUrl } from '../lib/debug-data';
import { ag } from './agrosys-tokens';

const benefits = [
  { icon: DownloadIcon, text: 'Distribuição de pacotes por cliente' },
  { icon: ChartIcon, text: 'Situação das atualizações em tempo real' },
  { icon: ShieldIcon, text: 'Acesso controlado e auditado' }
];

export default function Login() {
  const router = useRouter(),
    [user, setUser] = useState(''),
    [password, setPassword] = useState(''),
    [showPassword, setShowPassword] = useState(false),
    [caps, setCaps] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    // quais logins o servidor liga (AUTH_MODO): local, Zitadel ou os dois
    [modes, setModes] = useState({ local: true, zitadel: false });
  useEffect(() => {
    const returned = new URLSearchParams(location.search).get('erro');
    if (returned) {
      setError(returned);
      history.replaceState(null, '', '/');
    }
    fetch('/api/v1/auth/modes')
      .then(response => response.ok && response.json())
      .then(data => data && setModes(data))
      .catch(() => {});
    if (syncDebugFromUrl()) {
      router.replace('/dashboard/');
      return;
    }
    fetch('/api/v1/admin/me', { credentials: 'same-origin' })
      .then(response => response.ok && router.replace('/dashboard/'))
      .catch(() => {});
  }, [router]);
  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!user.trim() || !password) return setError('Preencha usuário e senha.');
    setLoading(true);
    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: user.trim(), password })
      });
      if (!response.ok) return setError('Usuário ou senha inválidos.');
      const data = await response.json();
      localStorage.removeItem('token');
      localStorage.setItem('user', JSON.stringify(data.user));
      router.push('/dashboard/');
    } catch {
      setError('Não foi possível conectar ao servidor.');
    } finally {
      setLoading(false);
    }
  }
  const sso = modes.zitadel && (
    <Button
      href="/api/v1/auth/zitadel/login"
      variant="contained"
      fullWidth
      startIcon={<LoginIcon />}
      sx={{ height: 46, fontSize: 14, fontWeight: 700, color: ag.navy }}
    >
      Entrar com Agrosys
    </Button>
  );
  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box
        component="aside"
        sx={{
          width: { md: 540 },
          flexShrink: 0,
          bgcolor: ag.navy,
          color: '#fff',
          px: { xs: 3, md: 8 },
          pt: { xs: 5, md: 7 },
          pb: { xs: 9, md: 7 },
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: { xs: 2, md: 5 }
        }}
      >
        <Box component="img" src="/logo-agrosys.svg" alt="Agrosys by aliare" sx={{ width: { xs: 140, md: 174 }, height: 'auto' }} />
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 0.75, md: 2.5 } }}>
          <Typography
            sx={{
              display: { xs: 'none', md: 'block' },
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '.14em',
              textTransform: 'uppercase',
              color: ag.ciano
            }}
          >
            Hub Central
          </Typography>
          <Typography component="h1" sx={{ fontSize: { xs: 20, md: 36 }, lineHeight: 1.2, fontWeight: 700 }}>
            Distribuição e controle de atualizações
          </Typography>
          <Typography sx={{ display: { xs: 'none', md: 'block' }, fontSize: 14.5, lineHeight: 1.6, color: '#b8ced8', maxWidth: 380 }}>
            Publique versões, acompanhe a instalação nos clientes e mantenha todo o parque atualizado em um só lugar.
          </Typography>
          <Box component="ul" sx={{ display: { xs: 'none', md: 'flex' }, flexDirection: 'column', gap: 1.5, listStyle: 'none', m: 0, mt: 1, p: 0 }}>
            {benefits.map(({ icon: Icon, text }) => (
              <Box component="li" key={text} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: '#dce8ed' }}>
                <Icon sx={{ fontSize: 18, color: ag.ciano }} />
                {text}
              </Box>
            ))}
          </Box>
        </Box>
        <Typography sx={{ display: { xs: 'none', md: 'block' }, fontSize: 12, color: '#8fb0bf' }}>
          © 2026 Agrosys by Aliare
        </Typography>
      </Box>
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: { xs: 'flex-start', md: 'center' },
          justifyContent: 'center',
          px: { xs: 2, md: 3 },
          py: { xs: 0, md: 5 },
          mt: { xs: -5.5, md: 0 },
          pb: { xs: 4, md: 5 }
        }}
      >
        <Box
          component="form"
          onSubmit={submit}
          noValidate
          sx={{
            width: '100%',
            maxWidth: { xs: 'none', md: 380 },
            bgcolor: 'background.paper',
            borderRadius: `${ag.raioLg}px`,
            boxShadow: '0 8px 32px rgba(0,62,89,.10)',
            p: { xs: '28px 22px', md: 5 },
            display: 'flex',
            flexDirection: 'column',
            gap: 2.5
          }}
        >
          <Box>
            <Typography component="h2" variant="h5" sx={{ fontSize: 24, mb: 0.75 }}>
              Acessar painel
            </Typography>
            <Typography color="text.secondary">
              {modes.zitadel && modes.local
                ? 'Entre com sua conta Agrosys ou usuário local.'
                : modes.zitadel
                  ? 'Entre com sua conta Agrosys.'
                  : 'Entre com seu usuário e senha.'}
            </Typography>
          </Box>
          {sso}
          {modes.zitadel && modes.local && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                fontSize: 12,
                color: 'text.secondary',
                '&::before, &::after': { content: '""', flex: 1, height: '1px', bgcolor: 'divider' }
              }}
            >
              ou usuário local
            </Box>
          )}
          {error && (
            <Alert severity="error" role="alert">
              {error}
            </Alert>
          )}
          {modes.local && (
            <>
              <TextField
                label="Usuário"
                value={user}
                onChange={e => setUser(e.target.value)}
                autoComplete="username"
                slotProps={{ inputLabel: { shrink: true } }}
                fullWidth
              />
              <TextField
                label="Senha"
                type={showPassword ? 'text' : 'password'}
                placeholder="Digite sua senha"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyUp={e => setCaps(Boolean(e.getModifierState?.('CapsLock')))}
                autoComplete="current-password"
                helperText={caps ? 'Caps Lock está ativado.' : undefined}
                fullWidth
                slotProps={{
                  inputLabel: { shrink: true },
                  formHelperText: { sx: { color: '#8a5a00', mx: 0 } },
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                          onClick={() => setShowPassword(v => !v)}
                          edge="end"
                        >
                          {showPassword ? <EyeOffIcon fontSize="small" /> : <EyeIcon fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    )
                  }
                }}
              />
              <Button
                type="submit"
                color="secondary"
                variant="contained"
                disabled={loading}
                fullWidth
                sx={{ height: 46, fontSize: 14, gap: 1 }}
              >
                {loading && <CircularProgress size={16} color="inherit" />}
                {loading ? 'Entrando...' : 'Entrar'}
              </Button>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
