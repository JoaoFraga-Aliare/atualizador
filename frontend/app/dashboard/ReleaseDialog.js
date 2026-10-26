'use client';
import { useEffect, useState } from 'react';
import {
  Alert,
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
  TextField,
  Typography
} from '@mui/material';
import { api } from '../../lib/api';

const channels = ['test', 'beta', 'production'];
const emptyForm = {
  productId: '',
  version: '',
  artifactType: 'package',
  artifactId: '',
  sqlContent: '',
  channel: 'test',
  targetType: 'all',
  targetClientIds: [],
  mandatory: false,
  deadlineAt: '',
  minimumVersion: '',
  rolloutPercent: 100,
  notes: '',
  technicalNotes: '',
  showNotesPdv: false
};

export default function ReleaseDialog({ open, close, clients, products, done, selectedArtifact }) {
  const [form, setForm] = useState(emptyForm),
    [file, setFile] = useState(null),
    [artifacts, setArtifacts] = useState([]),
    [artifactChannels, setArtifactChannels] = useState(channels),
    [error, setError] = useState('');
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(emptyForm);
    setFile(null);
    setArtifactChannels(channels);
    api('/admin/artifacts')
      .then(items => {
        const pending = items.filter(x => x.status !== 'released');
        setArtifacts(pending);
        const artifact = pending.find(x => x.id === selectedArtifact?.id);
        if (artifact) {
          const product = products.find(item => item.code === artifact.product_code),
            allowed = String(artifact.allowed_channels || artifact.channel)
              .split(',')
              .filter(Boolean);
          setArtifactChannels(allowed);
          setForm(current => ({
            ...current,
            artifactId: artifact.id,
            productId: product?.id || '',
            version: artifact.version,
            channel: allowed.includes(artifact.channel) ? artifact.channel : allowed[0],
            artifactType: 'package'
          }));
        }
      })
      .catch(e => setError(e.message));
  }, [open, selectedArtifact, products]);
  function chooseArtifact(id) {
    const artifact = artifacts.find(item => item.id === id);
    if (!artifact) {
      setArtifactChannels(channels);
      set('artifactId', '');
      return;
    }
    const product = products.find(item => item.code === artifact.product_code),
      allowed = String(artifact.allowed_channels || artifact.channel)
        .split(',')
        .filter(Boolean);
    setArtifactChannels(allowed);
    setForm(current => ({
      ...current,
      artifactId: id,
      productId: product?.id || '',
      version: artifact.version,
      channel: allowed.includes(artifact.channel) ? artifact.channel : allowed[0],
      artifactType: 'package'
    }));
    setFile(null);
  }
  async function send() {
    try {
      if (!form.artifactId && form.artifactType === 'package' && !file)
        throw new Error('Selecione um artefato enviado ou um arquivo ZIP');
      const body = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (key !== 'artifactId') body.append(key, Array.isArray(value) ? JSON.stringify(value) : String(value));
      });
      if (form.artifactId) body.append('artifactId', form.artifactId);
      else if (file) body.append('artifact', file);
      await api('/admin/releases', { method: 'POST', body });
      done();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>Adicionar versao</DialogTitle>
      <DialogContent>
        <Stack spacing={2} mt={1}>
          {error && <Alert severity="error">{error}</Alert>}
          <FormControl>
            <InputLabel>Artefato CI/CD</InputLabel>
            <Select label="Artefato CI/CD" value={form.artifactId} onChange={e => chooseArtifact(e.target.value)}>
              <MenuItem value="">Enviar arquivo manualmente</MenuItem>
              {artifacts.map(item => (
                <MenuItem key={item.id} value={item.id}>
                  {item.product_name || item.product_code} - {item.version} -{' '}
                  {String(item.allowed_channels || item.channel)
                    .split(',')
                    .join(' / ')}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {form.artifactId && (
            <Alert severity="info">
              Produto e versão foram preenchidos pelo artefato. Escolha um dos ambientes autorizados pelo token.
            </Alert>
          )}
          <FormControl>
            <InputLabel>Produto</InputLabel>
            <Select label="Produto" value={form.productId} onChange={e => set('productId', e.target.value)}>
              {products.map(p => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Versao"
            value={form.version}
            onChange={e => set('version', e.target.value)}
            disabled={Boolean(form.artifactId)}
          />
          {!form.artifactId && (
            <>
              <FormControl>
                <InputLabel>Tipo</InputLabel>
                <Select label="Tipo" value={form.artifactType} onChange={e => set('artifactType', e.target.value)}>
                  <MenuItem value="package">Pacote ZIP</MenuItem>
                  <MenuItem value="sql">Script SQL</MenuItem>
                </Select>
              </FormControl>
              {form.artifactType === 'package' && (
                <input type="file" accept=".zip,application/zip" onChange={e => setFile(e.target.files?.[0] || null)} />
              )}
            </>
          )}
          <FormControl>
            <InputLabel>Ambiente</InputLabel>
            <Select label="Ambiente" value={form.channel} onChange={e => set('channel', e.target.value)}>
              {(form.artifactId ? artifactChannels : channels).map(channel => (
                <MenuItem key={channel} value={channel}>
                  {channel}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl>
            <InputLabel>Liberaçao</InputLabel>
            <Select label="Liberaçao" value={form.targetType} onChange={e => set('targetType', e.target.value)}>
              <MenuItem value="all">Todos os clientes</MenuItem>
              <MenuItem value="client">Clientes selecionados</MenuItem>
            </Select>
          </FormControl>
          {form.targetType === 'client' && (
            <FormControl>
              <InputLabel>Clientes</InputLabel>
              <Select
                multiple
                label="Clientes"
                value={form.targetClientIds}
                onChange={e => set('targetClientIds', e.target.value)}
              >
                {clients.map(client => (
                  <MenuItem key={client.id} value={client.id}>
                    {client.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <TextField
            type="datetime-local"
            label="Prazo"
            InputLabelProps={{ shrink: true }}
            value={form.deadlineAt}
            onChange={e => set('deadlineAt', e.target.value)}
          />
          <TextField
            type="number"
            label="Liberação gradual (%)"
            helperText="Percentual de terminais que recebem a versão; aumente depois para ampliar."
            inputProps={{ min: 1, max: 100 }}
            value={form.rolloutPercent}
            onChange={e => set('rolloutPercent', e.target.value)}
          />
          <TextField
            label="Notas"
            multiline
            minRows={2}
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
          />
          <TextField
            label="Nota tecnica"
            multiline
            minRows={2}
            value={form.technicalNotes}
            onChange={e => set('technicalNotes', e.target.value)}
          />
          <Typography variant="caption" color="text.secondary">
            Artefatos enviados pelo Delphi aparecem aqui automaticamente apos o upload.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancelar</Button>
        <Button variant="contained" onClick={send}>
          Publicar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
