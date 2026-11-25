'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { syncDebugFromUrl } from '../lib/debug-data';
export default function Login() {
  const router = useRouter(),
    [user, setUser] = useState('admin'),
    [password, setPassword] = useState(''),
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
    const response = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, password })
    });
    if (!response.ok) return setError('Usuário ou senha inválidos');
    const data = await response.json();
    localStorage.removeItem('token');
    localStorage.setItem('user', JSON.stringify(data.user));
    router.push('/dashboard/');
  }
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        px: 2,
        py: 5,
        bgcolor: 'background.default'
      }}
    >
      <Box sx={{ width: '100%', maxWidth: 410 }}>
        <Stack alignItems="center" spacing={1.5} sx={{ mb: 3.5 }}>
          <Box sx={{ bgcolor: 'secondary.main', borderRadius: 3, px: 3, py: 2 }}>
            <Box component="img" src="/logo-agrosys.svg" alt="Agrosys by aliare" sx={{ width: 150, display: 'block' }} />
          </Box>
          <Box textAlign="center">
            <Typography variant="h6" fontSize={20}>
              Hub Central
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Distribuição e controle de atualizações
            </Typography>
          </Box>
        </Stack>
        <Paper sx={{ p: { xs: 3, sm: 4 }, borderRadius: 4, boxShadow: 'var(--ag-sombra-alta)' }}>
          <Stack component="form" onSubmit={submit} spacing={2.25}>
            <Typography variant="h5" fontWeight={700} letterSpacing="-.02em">
              Acessar painel
            </Typography>
            {error && <Alert severity="error">{error}</Alert>}
            {modes.local && (
              <>
                <TextField label="Usuário" value={user} onChange={e => setUser(e.target.value)} fullWidth />
                <TextField
                  label="Senha"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  fullWidth
                />
                <Button type="submit" size="large" variant="contained" fullWidth>
                  Entrar
                </Button>
              </>
            )}
            {modes.zitadel && (
              <Button
                href="/api/v1/auth/zitadel/login"
                size="large"
                variant={modes.local ? 'outlined' : 'contained'}
                fullWidth
              >
                Entrar com Agrosys
              </Button>
            )}
          </Stack>
        </Paper>
      </Box>
    </Box>
  );
}
