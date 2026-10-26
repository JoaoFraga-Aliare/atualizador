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
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Download as DownloadIcon,
  Merge as MergeIcon,
  Publish as PublishIcon,
  Visibility as VisibilityIcon
} from '@mui/icons-material';
const fmt = value =>
  value ? new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z').toLocaleString('pt-BR') : '-';
async function download(item) {
  const response = await fetch(`/api/v1/admin/artifacts/${item.id}/download`, { credentials: 'same-origin' });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Falha no download');
  const url = URL.createObjectURL(await response.blob()),
    a = document.createElement('a');
  a.href = url;
  a.download = item.original_name;
  a.click();
  URL.revokeObjectURL(url);
}
export default function CiArtifacts({ release, notify }) {
  const [items, setItems] = useState([]),
    [selected, setSelected] = useState([]),
    [details, setDetails] = useState(null),
    [merge, setMerge] = useState(null),
    [error, setError] = useState('');
  async function load() {
    try {
      setItems(await api('/admin/artifacts'));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  const run = async fn => {
    try {
      setError('');
      await fn();
    } catch (e) {
      setError(e.message);
    }
  };
  async function files(item) {
    setDetails(await api(`/admin/artifacts/${item.id}/files`));
  }
  async function remove(item) {
    if (!confirm(`Excluir o artefato ${item.version}?`)) return;
    await api(`/admin/artifacts/${item.id}`, { method: 'DELETE' });
    notify('Artefato excluído');
    load();
  }
  async function preview() {
    const value = await api('/admin/artifacts/merge/preview', {
      method: 'POST',
      body: JSON.stringify({ artifactIds: selected })
    });
    setMerge({ ...value, artifactIds: selected, version: '', resolutions: {} });
  }
  async function finish() {
    const resolutions = {};
    for (const [path, id] of Object.entries(merge.resolutions)) resolutions[path.toLocaleLowerCase('en-US')] = id;
    await api('/admin/artifacts/merge', {
      method: 'POST',
      body: JSON.stringify({ artifactIds: merge.artifactIds, version: merge.version, resolutions })
    });
    setMerge(null);
    setSelected([]);
    notify('Versões mescladas');
    load();
  }
  const toggle = id => setSelected(x => (x.includes(id) ? x.filter(v => v !== id) : [...x, id]));
  return (
    <Stack spacing={2}>
      {error && (
        <Alert severity="error" onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography color="text.secondary">{items.length} envio(s) CI/CD</Typography>
        <Button
          startIcon={<MergeIcon />}
          variant="contained"
          disabled={selected.length < 2}
          onClick={() => run(preview)}
        >
          Mesclar selecionadas
        </Button>
      </Stack>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" />
              <TableCell>Produto</TableCell>
              <TableCell>Versão</TableCell>
              <TableCell>Canal</TableCell>
              <TableCell>Enviado por</TableCell>
              <TableCell>Data</TableCell>
              <TableCell>Tamanho</TableCell>
              <TableCell>Situação</TableCell>
              <TableCell>Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map(item => (
              <TableRow key={item.id}>
                <TableCell padding="checkbox">
                  <Checkbox checked={selected.includes(item.id)} onChange={() => toggle(item.id)} />
                </TableCell>
                <TableCell>{item.product_name || item.product_code}</TableCell>
                <TableCell>{item.version}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={String(item.allowed_channels || item.channel)
                      .split(',')
                      .join(' / ')}
                  />
                </TableCell>
                <TableCell>{item.user_name || item.username || '-'}</TableCell>
                <TableCell>{fmt(item.created_at)}</TableCell>
                <TableCell>{(item.size_bytes / 1024 / 1024).toFixed(2)} MB</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    color={item.status === 'pending' ? 'warning' : 'success'}
                    label={item.status === 'pending' ? 'Pendente' : 'Liberada'}
                  />
                </TableCell>
                <TableCell>
                  <Stack direction="row">
                    <Tooltip title="Ver arquivos">
                      <IconButton onClick={() => run(() => files(item))}>
                        <VisibilityIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Baixar ZIP">
                      <IconButton onClick={() => run(() => download(item))}>
                        <DownloadIcon />
                      </IconButton>
                    </Tooltip>
                    {item.status === 'pending' && (
                      <Tooltip title="Liberar versão">
                        <IconButton color="success" onClick={() => release(item)}>
                          <PublishIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="Excluir">
                      <IconButton color="error" onClick={() => run(() => remove(item))}>
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {!items.length && <Alert severity="info">Nenhuma versão enviada pelo CI/CD.</Alert>}
      <Dialog open={!!details} onClose={() => setDetails(null)} fullWidth maxWidth="md">
        <DialogTitle>Arquivos de {details?.artifact.version}</DialogTitle>
        <DialogContent>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Arquivo</TableCell>
                <TableCell>Tamanho</TableCell>
                <TableCell>SHA-256</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {details?.files.map(file => (
                <TableRow key={file.name}>
                  <TableCell>{file.name}</TableCell>
                  <TableCell>{(file.sizeBytes / 1024).toFixed(1)} KB</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{file.sha256}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetails(null)}>Fechar</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={!!merge} onClose={() => setMerge(null)} fullWidth maxWidth="md">
        <DialogTitle>Mesclar versões</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <Alert severity="info">
              O novo ZIP terá {merge?.files || 0} arquivo(s). Arquivos com o mesmo caminho e SHA-256 são mesclados
              automaticamente.
            </Alert>
            <TextField
              required
              label="Versão resultante"
              value={merge?.version || ''}
              onChange={e => setMerge(x => ({ ...x, version: e.target.value }))}
            />
            {merge?.conflicts.map(conflict => (
              <Box key={conflict.path} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <Typography fontWeight={700} mb={1}>
                  {conflict.path}
                </Typography>
                <FormControl fullWidth>
                  <InputLabel>Arquivo que será usado</InputLabel>
                  <Select
                    label="Arquivo que será usado"
                    value={merge.resolutions[conflict.path] || ''}
                    onChange={e =>
                      setMerge(x => ({ ...x, resolutions: { ...x.resolutions, [conflict.path]: e.target.value } }))
                    }
                  >
                    {conflict.options.map(option => (
                      <MenuItem key={option.artifactId} value={option.artifactId}>
                        Versão {option.version} — {option.userName || 'usuário'} — SHA {option.sha256.slice(0, 12)}…
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMerge(null)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!merge?.version.trim() || merge?.conflicts.some(x => !merge.resolutions[x.path])}
            onClick={() => run(finish)}
          >
            Criar versão mesclada
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
