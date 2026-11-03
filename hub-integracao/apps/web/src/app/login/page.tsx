'use client';

import { useActionState } from 'react';
import { Alert, Box, Button, Paper, TextField, Typography } from '@mui/material';
import { entrar, type EstadoLogin } from './actions';

export default function Login() {
  const [estado, acao, pendente] = useActionState<EstadoLogin, FormData>(entrar, {});
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Paper sx={{ p: 4, width: '100%', maxWidth: 420 }}>
        <Box component="img" src="/logo.svg" alt="Logo" sx={{ height: 44, width: 'auto', mb: 3 }} />
        <Typography variant="h6" mb={0.5}>Hub de Integração</Typography>
        <Typography variant="body2" color="text.secondary" mb={3}>Entre para gerenciar empresas, terminais e parâmetros.</Typography>
        <Box component="form" action={acao} sx={{ display: 'grid', gap: 2 }}>
          <TextField name="email" type="email" label="E-mail" required autoComplete="username" fullWidth />
          <TextField name="senha" type="password" label="Senha" required autoComplete="current-password" fullWidth />
          {estado.erro && <Alert severity="error">{estado.erro}</Alert>}
          <Button type="submit" variant="contained" size="large" disabled={pendente}>{pendente ? 'Entrando…' : 'Entrar'}</Button>
        </Box>
        <Typography variant="caption" color="text.secondary" display="block" mt={2}>
          Login corporativo (SSO) será oferecido aqui quando estiver ativo.
        </Typography>
      </Paper>
    </Box>
  );
}
