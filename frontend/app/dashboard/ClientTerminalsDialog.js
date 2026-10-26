'use client';
import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import {
  BugReport as BugReportIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  History as HistoryIcon,
  KeyOff as KeyOffIcon,
  ReceiptLong as ReceiptLongIcon,
  Settings as SettingsIcon,
  Storage as StorageIcon
} from '@mui/icons-material';
import { api, apiBlob } from '../../lib/api';

const fmt = value =>
  value ? new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z').toLocaleString('pt-BR') : '-';
const size = value => `${((value || 0) / 1024 / 1024).toFixed(2)} MB`;
const channelStyle = channel =>
  ({
    test: { bgcolor: '#7b1fa2', color: '#fff' },
    beta: { bgcolor: '#1976d2', color: '#fff' },
    production: { bgcolor: '#2e7d32', color: '#fff' }
  })[channel] || {};

const keyLabels = {
  confirmed: {
    label: 'Própria',
    color: 'success',
    hint: 'O terminal usa a chave própria; a chave global não vale mais para ele.'
  },
  pending: { label: 'Emitida', color: 'warning', hint: 'Chave emitida, ainda não usada pelo terminal.' },
  none: { label: 'Global', color: 'default', hint: 'O terminal ainda usa a chave global de instalação.' }
};

export default function ClientTerminalsDialog({ client, terminals, close, showLog, showErrors }) {
  const [databaseTerminal, setDatabaseTerminal] = useState(null),
    [keyStatus, setKeyStatus] = useState({}),
    [keyMessage, setKeyMessage] = useState('');
  async function resetKey(terminal) {
    if (
      !confirm(
        `Descartar a chave do terminal ${terminal.name}? Ele volta a usar a chave global e recebe outra chave na próxima consulta.`
      )
    )
      return;
    try {
      await api(`/admin/terminals/${terminal.id}/reset-key`, { method: 'POST', body: JSON.stringify({}) });
      setKeyStatus(current => ({ ...current, [terminal.id]: 'none' }));
      setKeyMessage(`Chave do terminal ${terminal.name} descartada.`);
    } catch (e) {
      setKeyMessage(e.message);
    }
  }
  const sorted = [...terminals].sort(
    (a, b) =>
      String(a.product_code || '').localeCompare(String(b.product_code || ''), 'pt-BR', { sensitivity: 'base' }) ||
      String(a.channel || '').localeCompare(String(b.channel || ''), 'pt-BR', { sensitivity: 'base' }) ||
      String(a.current_version || '').localeCompare(String(b.current_version || ''), 'pt-BR', {
        numeric: true,
        sensitivity: 'base'
      })
  );
  return (
    <>
      <Dialog open={!!client} fullWidth maxWidth="lg" onClose={close}>
        <DialogTitle>Terminais de {client?.name}</DialogTitle>
        <DialogContent>
          {keyMessage && (
            <Alert sx={{ mb: 2 }} onClose={() => setKeyMessage('')}>
              {keyMessage}
            </Alert>
          )}
          <Box sx={{ overflowX: 'auto' }}>
            <Box sx={{ minWidth: 1050 }}>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7,minmax(0,1fr)) minmax(190px,1.4fr)',
                  gap: 2,
                  p: 1,
                  fontWeight: 700
                }}
              >
                {['Terminal', 'Computador', 'Produto', 'Canal', 'Versao', 'Chave', 'Ultimo contato', 'Acoes'].map(x => (
                  <Box key={x}>{x}</Box>
                ))}
              </Box>
              {sorted.map(terminal => (
                <Box
                  key={terminal.id}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7,minmax(0,1fr)) minmax(190px,1.4fr)',
                    gap: 2,
                    p: 1.5,
                    borderTop: '1px solid',
                    borderColor: 'divider',
                    alignItems: 'center'
                  }}
                >
                  <Box>{terminal.name}</Box>
                  <Box>{terminal.computer_name || '-'}</Box>
                  <Box>{terminal.product_code}</Box>
                  <Box>
                    <Chip size="small" label={terminal.channel} sx={channelStyle(terminal.channel)} />
                  </Box>
                  <Box>{terminal.current_version}</Box>
                  <Box>
                    {(() => {
                      const key = keyLabels[keyStatus[terminal.id] || terminal.terminal_key_status] || keyLabels.none;
                      return (
                        <Tooltip title={key.hint}>
                          <Chip size="small" variant="outlined" color={key.color} label={key.label} />
                        </Tooltip>
                      );
                    })()}
                  </Box>
                  <Box>{fmt(terminal.last_seen_at)}</Box>
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      startIcon={<ReceiptLongIcon />}
                      onClick={() => showLog(terminal)}
                      aria-label="Ver log"
                    />
                    <Button
                      size="small"
                      startIcon={<BugReportIcon />}
                      onClick={() => showErrors(terminal)}
                      aria-label="Ver erros"
                    />
                    <Button
                      size="small"
                      startIcon={<StorageIcon />}
                      onClick={() => setDatabaseTerminal(terminal)}
                      aria-label="Banco"
                    />
                    {(keyStatus[terminal.id] || terminal.terminal_key_status) !== 'none' && (
                      <Tooltip title="Descartar chave do terminal">
                        <IconButton size="small" onClick={() => resetKey(terminal)} aria-label="Descartar chave">
                          <KeyOffIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Stack>
                </Box>
              ))}
            </Box>
          </Box>
          {!terminals.length && (
            <Typography color="text.secondary" mt={2}>
              Nenhum terminal cadastrado.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>Fechar</Button>
        </DialogActions>
      </Dialog>
      <DatabaseDialog client={client} terminal={databaseTerminal} close={() => setDatabaseTerminal(null)} />
    </>
  );
}

function DatabaseDialog({ client, terminal, close }) {
  const [state, setState] = useState(null),
    [message, setMessage] = useState(''),
    [history, setHistory] = useState(null),
    [settings, setSettings] = useState(null);
  async function load() {
    if (!terminal) return;
    try {
      setMessage('');
      setState(await api(`/admin/terminals/${terminal.id}/database`));
    } catch (e) {
      setMessage(e.message);
    }
  }
  useEffect(() => {
    setState(null);
    setHistory(null);
    setSettings(null);
    load();
  }, [terminal?.id]);
  async function requestDatabase() {
    try {
      await api(`/admin/terminals/${terminal.id}/database/request`, { method: 'POST', body: JSON.stringify({}) });
      await load();
      setMessage('Banco solicitado.');
    } catch (e) {
      setMessage(e.message);
    }
  }
  async function downloadPath(path, name) {
    try {
      const blob = await apiBlob(path),
        url = URL.createObjectURL(blob),
        link = document.createElement('a');
      link.href = url;
      link.download = name || 'banco.zip';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setMessage(e.message);
    }
  }
  const downloadLast = () =>
    downloadPath(
      `/admin/terminals/${terminal.id}/database/download`,
      state?.originalName || `banco-${terminal.name || terminal.id}.zip`
    );
  async function openTerminalHistory() {
    try {
      setHistory({
        title: `Historico de ${terminal.name}`,
        groups: [{ terminal, items: (await api(`/admin/terminals/${terminal.id}/database/history`)).items }]
      });
    } catch (e) {
      setMessage(e.message);
    }
  }
  async function openClientHistory() {
    try {
      const data = await api(`/admin/clients/${client.id}/database/history`);
      setHistory({ title: `Historico de ${client.name}`, groups: data.items });
    } catch (e) {
      setMessage(e.message);
    }
  }
  async function openSettings() {
    try {
      setSettings(await api('/admin/database/settings'));
    } catch (e) {
      setMessage(e.message);
    }
  }
  async function saveSettings() {
    try {
      const next = await api('/admin/database/settings', { method: 'PATCH', body: JSON.stringify(settings) });
      setSettings(next);
      setMessage('Retencao atualizada.');
    } catch (e) {
      setMessage(e.message);
    }
  }
  async function removeUpload(upload) {
    try {
      await api(`/admin/database/uploads/${upload.id}`, { method: 'DELETE' });
      await load();
      if (history?.groups) {
        const groups = history.groups.map(group => ({
          ...group,
          items: group.items.filter(item => item.id !== upload.id)
        }));
        setHistory({ ...history, groups });
      }
    } catch (e) {
      setMessage(e.message);
    }
  }

  return (
    <Dialog open={!!terminal} onClose={close} fullWidth maxWidth="md">
      <DialogTitle>Banco do terminal {terminal?.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} mt={1}>
          {message && <Alert onClose={() => setMessage('')}>{message}</Alert>}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <Info label="Solicitacao" value={state?.requested ? 'Solicitado' : 'Aguardando nova solicitacao'} />
            <Info label="Solicitado em" value={fmt(state?.requestedAt)} />
            <Info
              label="Ultimo banco recebido"
              value={state?.lastUploadId ? `${state.originalName} (${size(state.sizeBytes)})` : 'Nenhum banco recebido'}
            />
            <Info label="Recebido em" value={fmt(state?.receivedAt)} />
          </Box>
          {state?.sha256 && <Info label="SHA-256" value={state.sha256} />}
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button startIcon={<HistoryIcon />} onClick={openTerminalHistory}>
              Historico terminal
            </Button>
            <Button startIcon={<HistoryIcon />} onClick={openClientHistory}>
              Historico cliente
            </Button>
            <Button startIcon={<SettingsIcon />} onClick={openSettings}>
              Retencao
            </Button>
          </Stack>
          {settings && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
              <TextField
                size="small"
                type="number"
                label="Dias armazenados"
                value={settings.retentionDays}
                onChange={e => setSettings({ ...settings, retentionDays: Number(e.target.value) })}
              />
              <TextField
                size="small"
                type="number"
                label="Quantidade por terminal"
                value={settings.retentionCount}
                onChange={e => setSettings({ ...settings, retentionCount: Number(e.target.value) })}
              />
              <Button variant="contained" onClick={saveSettings}>
                Salvar retencao
              </Button>
            </Stack>
          )}
          {history && (
            <HistoryView
              history={history}
              download={item => downloadPath(`/admin/database/uploads/${item.id}/download`, item.originalName)}
              remove={removeUpload}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Fechar</Button>
        <Button startIcon={<DownloadIcon />} disabled={!state?.lastUploadId} onClick={downloadLast}>
          Baixar banco
        </Button>
        <Button variant="contained" onClick={requestDatabase}>
          Solicitar banco
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function Info({ label, value }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography sx={{ wordBreak: 'break-word' }}>{value || '-'}</Typography>
    </Box>
  );
}

function HistoryView({ history, download, remove }) {
  return (
    <Box>
      <Divider sx={{ my: 1 }} />
      <Typography variant="h6" mb={1}>
        {history.title}
      </Typography>
      <Stack spacing={2}>
        {history.groups.map(group => (
          <Box key={group.terminal.id}>
            <Typography fontWeight={700}>
              {group.terminal.name} {group.terminal.computer_name ? `- ${group.terminal.computer_name}` : ''}
            </Typography>
            {group.items.length ? (
              group.items.map(item => (
                <Box
                  key={item.id}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr auto', md: '1fr 150px 135px auto' },
                    gap: 1,
                    alignItems: 'center',
                    py: 1,
                    borderTop: '1px solid',
                    borderColor: 'divider'
                  }}
                >
                  <Typography sx={{ wordBreak: 'break-word' }}>{item.originalName}</Typography>
                  <Typography color="text.secondary">{size(item.sizeBytes)}</Typography>
                  <Typography color="text.secondary">{fmt(item.receivedAt)}</Typography>
                  <Stack direction="row">
                    <Tooltip title="Baixar">
                      <IconButton onClick={() => download(item)}>
                        <DownloadIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Excluir">
                      <IconButton color="error" onClick={() => remove(item)}>
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Box>
              ))
            ) : (
              <Typography color="text.secondary" mt={1}>
                Nenhum banco recebido.
              </Typography>
            )}
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
