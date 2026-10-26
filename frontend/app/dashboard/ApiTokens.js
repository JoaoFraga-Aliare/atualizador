'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  Stack,
  TextField,
  Typography
} from '@mui/material';

const channelOptions = [
  ['test', 'Teste'],
  ['beta', 'Beta'],
  ['production', 'Produção']
];
const fmt = value =>
  value ? new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z').toLocaleString('pt-BR') : '—';

export default function ApiTokens({ products, notify }) {
  const [items, setItems] = useState([]),
    [open, setOpen] = useState(false),
    [generated, setGenerated] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', expiresAt: '', productIds: [], channels: [] });
  async function load() {
    try {
      setItems(await api('/admin/me/api-tokens'));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  const toggle = (key, value) =>
    setForm(current => ({
      ...current,
      [key]: current[key].includes(value) ? current[key].filter(item => item !== value) : [...current[key], value]
    }));
  function create() {
    setForm({ name: '', expiresAt: '', productIds: [], channels: [] });
    setGenerated('');
    setError('');
    setOpen(true);
  }
  async function generate() {
    if (!form.name.trim() || !form.productIds.length || !form.channels.length)
      return setError('Informe o nome e selecione pelo menos um produto e ambiente.');
    try {
      setBusy(true);
      setError('');
      const result = await api('/admin/me/api-tokens', {
        method: 'POST',
        body: JSON.stringify({ ...form, expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null })
      });
      setGenerated(result.token);
      await load();
      notify?.('Token criado com sucesso');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function revoke(item) {
    if (!confirm(`Revogar o token “${item.name}”?`)) return;
    try {
      await api(`/admin/me/api-tokens/${item.id}`, { method: 'DELETE' });
      await load();
      notify?.('Token revogado');
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <Stack spacing={2}>
      {error && !open && (
        <Alert severity="error" onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ sm: 'center' }}
        spacing={1}
      >
        <Box>
          <Typography variant="h6">Tokens de acesso CI/CD</Typography>
          <Typography variant="body2" color="text.secondary">
            {items.filter(x => x.active).length} ativo(s) de {items.length} token(s)
          </Typography>
        </Box>
        <Button variant="contained" onClick={create}>
          Novo token
        </Button>
      </Stack>
      <Box sx={{ overflowX: 'auto' }}>
        <Box sx={{ minWidth: 920 }}>
          <Box
            sx={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr .8fr 1fr .9fr', gap: 2, p: 1, fontWeight: 700 }}
          >
            {['Token', 'Validade', 'Escopo', 'Versões enviadas', 'Última versão', 'Ações'].map(x => (
              <Box key={x}>{x}</Box>
            ))}
          </Box>
          {items.map(item => (
            <Box
              key={item.id}
              sx={{
                display: 'grid',
                gridTemplateColumns: '1.4fr 1fr 1fr .8fr 1fr .9fr',
                gap: 2,
                p: 1.5,
                borderTop: '1px solid',
                borderColor: 'divider',
                alignItems: 'center'
              }}
            >
              <Box>
                <Typography fontWeight={700}>{item.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  Criado em {fmt(item.createdAt)}
                </Typography>
                <Box mt={0.5}>
                  <Chip
                    size="small"
                    color={item.active ? 'success' : 'default'}
                    label={item.revokedAt ? 'Revogado' : item.active ? 'Ativo' : 'Expirado'}
                  />
                </Box>
              </Box>
              <Typography variant="body2">{item.expiresAt ? fmt(item.expiresAt) : 'Sem expiração'}</Typography>
              <Box>
                <Typography variant="body2">
                  {products
                    .filter(p => item.productIds.includes(p.id))
                    .map(p => p.name)
                    .join(', ') || '—'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {item.channels.join(', ')}
                </Typography>
              </Box>
              <Typography fontWeight={700}>{item.versionsSent}</Typography>
              <Box>
                <Typography fontWeight={700}>{item.lastVersion || '—'}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {item.lastVersionAt ? fmt(item.lastVersionAt) : 'Nenhum envio'}
                </Typography>
              </Box>
              <Button color="error" disabled={!item.active} onClick={() => revoke(item)}>
                Revogar
              </Button>
            </Box>
          ))}
        </Box>
      </Box>
      {!items.length && <Alert severity="info">Nenhum token cadastrado.</Alert>}
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Novo token CI/CD</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              required
              label="Nome do token"
              placeholder="Ex.: Pipeline principal"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
            />
            <TextField
              type="datetime-local"
              label="Validade (opcional)"
              InputLabelProps={{ shrink: true }}
              inputProps={{
                min: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
              }}
              value={form.expiresAt}
              onChange={e => setForm({ ...form, expiresAt: e.target.value })}
            />
            <Typography variant="subtitle2">Produtos permitidos</Typography>
            <FormGroup>
              {products.map(product => (
                <FormControlLabel
                  key={product.id}
                  control={
                    <Checkbox
                      checked={form.productIds.includes(product.id)}
                      onChange={() => toggle('productIds', product.id)}
                    />
                  }
                  label={product.name}
                />
              ))}
            </FormGroup>
            <Typography variant="subtitle2">Ambientes permitidos</Typography>
            <FormGroup row>
              {channelOptions.map(([value, label]) => (
                <FormControlLabel
                  key={value}
                  control={
                    <Checkbox checked={form.channels.includes(value)} onChange={() => toggle('channels', value)} />
                  }
                  label={label}
                />
              ))}
            </FormGroup>
            {generated && (
              <Alert severity="warning">
                <Typography variant="body2">Copie este token agora. Ele não será exibido novamente.</Typography>
                <Typography sx={{ wordBreak: 'break-all', fontFamily: 'monospace', mt: 1 }}>{generated}</Typography>
                <Button size="small" onClick={() => navigator.clipboard.writeText(generated)}>
                  Copiar token
                </Button>
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Fechar</Button>
          {!generated && (
            <Button variant="contained" onClick={generate} disabled={busy}>
              Gerar token
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
