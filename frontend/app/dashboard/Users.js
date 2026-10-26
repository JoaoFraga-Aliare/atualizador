'use client';
import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField
} from '@mui/material';
import { BackHome, Grid } from './components';
import { channels } from './format';
import { api } from '../../lib/api';

export function Users({ items, create, done }) {
  async function toggle(u) {
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ active: !u.active }) });
      done('Usuário atualizado');
    } catch (e) {
      done(e.message);
    }
  }
  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between">
        <Button variant="contained" onClick={create}>
          Novo usuário
        </Button>
        <BackHome />
      </Stack>
      <Grid
        heads={['Nome', 'Login', 'Perfil', 'Produtos', 'Canais', 'Situação']}
        rows={items.map(u => [
          u.name,
          u.username,
          u.role,
          u.products || 'Todos',
          u.channels || 'Todos',
          <Button key={u.id} onClick={() => toggle(u)}>
            {u.active ? 'Desativar' : 'Ativar'}
          </Button>
        ])}
      />
    </Stack>
  );
}
export function UserDialog({ open, close, products, done }) {
  const [form, setForm] = useState({
      name: '',
      username: '',
      password: '',
      role: 'operator',
      productIds: [],
      channels: []
    }),
    set = (k, v) => setForm({ ...form, [k]: v });
  async function send() {
    await api('/admin/users', { method: 'POST', body: JSON.stringify(form) });
    done();
  }
  return (
    <Dialog open={open} onClose={close} fullWidth>
      <DialogTitle>Novo usuário</DialogTitle>
      <DialogContent>
        <Stack spacing={2} mt={1}>
          <TextField label="Nome" value={form.name} onChange={e => set('name', e.target.value)} />
          <TextField label="Login" value={form.username} onChange={e => set('username', e.target.value)} />
          <TextField
            label="Senha (mínimo 8 caracteres)"
            type="password"
            value={form.password}
            onChange={e => set('password', e.target.value)}
          />
          <FormControl>
            <InputLabel>Perfil</InputLabel>
            <Select label="Perfil" value={form.role} onChange={e => set('role', e.target.value)}>
              <MenuItem value="operator">Usuário limitado</MenuItem>
              <MenuItem value="admin">Administrador</MenuItem>
            </Select>
          </FormControl>
          {form.role === 'operator' && (
            <>
              <FormControl>
                <InputLabel>Produtos</InputLabel>
                <Select
                  multiple
                  label="Produtos"
                  value={form.productIds}
                  onChange={e => set('productIds', e.target.value)}
                >
                  {products.map(p => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <InputLabel>Canais</InputLabel>
                <Select multiple label="Canais" value={form.channels} onChange={e => set('channels', e.target.value)}>
                  {channels.map(c => (
                    <MenuItem key={c} value={c}>
                      {c}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancelar</Button>
        <Button variant="contained" disabled={!form.name || !form.username || form.password.length < 8} onClick={send}>
          Cadastrar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
