'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import SystemUpdateAltRounded from '@mui/icons-material/SystemUpdateAltRounded';
export default function Login() {
  const router = useRouter(),
    [user, setUser] = useState('admin'),
    [password, setPassword] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
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
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', px: 2, py: 5 }}>
      <Box sx={{ width: '100%', maxWidth: 390 }}>
        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 3 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'primary.main',
              color: '#fff',
              borderRadius: 1.5
            }}
          >
            <SystemUpdateAltRounded fontSize="small" />
          </Box>
          <Typography variant="h6">Central de Atualização</Typography>
        </Stack>
        <Paper sx={{ p: { xs: 3, sm: 4 } }}>
          <Stack component="form" onSubmit={submit} spacing={2.25}>
            <Typography variant="h4">Acessar painel</Typography>
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
