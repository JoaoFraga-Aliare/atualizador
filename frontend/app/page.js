'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { syncDebugFromUrl } from '../lib/debug-data';
import SystemUpdateAltRounded from '@mui/icons-material/SystemUpdateAltRounded';
export default function Login() {
  const router = useRouter(),
    [user, setUser] = useState('admin'),
    [password, setPassword] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
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
        background:
          'radial-gradient(900px 500px at 15% -10%, rgba(23,122,82,.16), transparent 60%), radial-gradient(700px 420px at 100% 110%, rgba(21,112,239,.10), transparent 60%), #f4f6f9'
      }}
    >
      <Box sx={{ width: '100%', maxWidth: 410 }}>
        <Stack alignItems="center" spacing={1.5} sx={{ mb: 3.5 }}>
          <Box
            sx={{
              width: 52,
              height: 52,
              display: 'grid',
              placeItems: 'center',
              color: '#fff',
              borderRadius: 3,
              background: 'linear-gradient(135deg,#34bdcf,#1f8e9d)',
              boxShadow: '0 8px 20px rgba(52,189,207,.35)'
            }}
          >
            <SystemUpdateAltRounded />
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
        <Paper sx={{ p: { xs: 3, sm: 4 }, borderRadius: 4, boxShadow: '0 20px 50px rgba(16,24,40,.10)' }}>
          <Stack component="form" onSubmit={submit} spacing={2.25}>
            <Typography variant="h5" fontWeight={700} letterSpacing="-.02em">
              Acessar painel
            </Typography>
            {error && <Alert severity="error">{error}</Alert>}
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
          </Stack>
        </Paper>
      </Box>
    </Box>
  );
}
