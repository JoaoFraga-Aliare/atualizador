'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography
} from '@mui/material';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import { api } from '../../lib/api';
import ReleaseCleanupDialog from './ReleaseCleanupDialog';

const fmt = value =>
  value ? new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z').toLocaleString('pt-BR') : '-';
const keyOf = item => `${item.type || 'regression'}:${item.id}`;

export default function NotificationsBell({ admin = false }) {
  const [data, setData] = useState({ items: [], reads: new Set() }),
    [open, setOpen] = useState(false),
    [error, setError] = useState(''),
    [detail, setDetail] = useState(null),
    [terminal, setTerminal] = useState(null),
    [cleanup, setCleanup] = useState(null);
  async function load() {
    try {
      const [regressions, hashes, cleanupData, reads, hubLogs, hubAlerts] = await Promise.all([
          api('/admin/notifications'),
          api('/admin/hash-notifications'),
          api('/admin/release-cleanup'),
          api('/admin/notification-reads'),
          // Erros do Hub (menu Hub > Logs define quais): so o administrador; Hub fora do ar nao atrapalha o sino
          admin ? api('/admin/hub/logs/notifications').catch(() => ({ itens: [] })) : { itens: [] },
          admin ? api('/admin/hub/alerts').catch(() => ({ abertos: [] })) : { abertos: [] }
        ]),
        unique = new Map(),
        cleanupItem = cleanupData.count
          ? {
              type: 'release_cleanup',
              id: cleanupData.key,
              receivedAt: `${cleanupData.date}T12:00:00Z`,
              message: `Há ${cleanupData.count} versões sem terminal ocupando ${(cleanupData.sizeBytes / 1024 / 1024).toFixed(2)} MB desnecessariamente.`,
              cleanup: cleanupData
            }
          : null;
      const hubItems = hubLogs.itens.map(x => ({
        type: 'hub_log',
        id: x.id,
        receivedAt: new Date(x.ultimo_em).toISOString(),
        client: x.empresa || 'Hub',
        hub: x
      }));
      const alertItems = hubAlerts.abertos.map(a => ({
        type: 'hub_alert',
        id: `${a.chave}@${a.aberto_em}`.slice(0, 90),
        receivedAt: new Date(a.aberto_em).toISOString(),
        client: 'Hub',
        alert: a
      }));
      for (const item of [...hashes.items, ...regressions.items, ...hubItems, ...alertItems, ...(cleanupItem ? [cleanupItem] : [])])
        unique.set(keyOf(item), item);
      setData({
        items: [...unique.values()].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)),
        reads: new Set(reads.map(x => x.key))
      });
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, []);
  const unread = useMemo(() => data.items.filter(x => !data.reads.has(keyOf(x))).length, [data]);
  async function mark(item) {
    const key = keyOf(item);
    await api('/admin/notification-reads', { method: 'POST', body: JSON.stringify({ key }) });
    setData(x => ({ items: x.items, reads: new Set([...x.reads, key]) }));
  }
  async function showError(item) {
    try {
      await mark(item);
      setDetail(await api(`/admin/errors/${item.id}`));
    } catch (e) {
      setError(e.message);
    }
  }
  async function showTerminal(item) {
    try {
      await mark(item);
      setTerminal(await api(`/admin/errors/${item.id}/terminal`));
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <>
      <IconButton
        color="inherit"
        aria-label={`Notificações: ${unread} não lida(s)`}
        onClick={() => {
          setOpen(true);
          load();
        }}
      >
        <Badge badgeContent={unread} color="error">
          <NotificationsNoneIcon />
        </Badge>
      </IconButton>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="lg">
        <DialogTitle>Central de notificações</DialogTitle>
        <DialogContent>
          <Stack spacing={1} mt={1}>
            {error && <Alert severity="error">{error}</Alert>}
            {data.items.length ? (
              data.items.map(item => (
                <NotificationCard
                  key={keyOf(item)}
                  item={item}
                  read={data.reads.has(keyOf(item))}
                  mark={mark}
                  showError={showError}
                  showTerminal={showTerminal}
                  showCleanup={async () => {
                    await mark(item);
                    setCleanup(item.cleanup);
                  }}
                />
              ))
            ) : (
              <Alert severity="success">Nenhuma notificação.</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Fechar</Button>
        </DialogActions>
      </Dialog>
      <InfoDialog
        title={detail && `Erro #${detail.id}`}
        value={detail}
        close={() => setDetail(null)}
        fields={
          detail && [
            ['Versão', detail.version],
            ['Exceção', detail.exceptionClass || detail.exception],
            ['Mensagem', detail.message],
            ['Recebido em', fmt(detail.received_at)],
            ['Hash do executável', detail.executableHash || detail.executableSha256 || detail.pdvHash || '-']
          ]
        }
      />
      <InfoDialog
        title={terminal && `Terminal #${terminal.id}`}
        value={terminal}
        close={() => setTerminal(null)}
        fields={
          terminal && [
            ['Cliente', terminal.client_name],
            ['Nome', terminal.name],
            ['Computador', terminal.computer_name || '-'],
            ['Produto', terminal.product_code],
            ['Canal', terminal.channel],
            ['Versão atual', terminal.current_version],
            ['Último contato', fmt(terminal.last_seen_at)],
            ['ID externo', terminal.external_id]
          ]
        }
      />
      <ReleaseCleanupDialog
        value={cleanup}
        close={() => setCleanup(null)}
        done={() => {
          setCleanup(null);
          load();
        }}
      />
    </>
  );
}

const hubChannel = { 'terminal->hub': 'PDV/Integrador', 'hub->erp': 'Agrosys', 'cliente->hub': 'Sistema do cliente (API)' };
const hubLogTitle = x =>
  `${hubChannel[x.canal] || x.canal}: ${x.resultado === 'erro' ? 'erro' : 'recusado'} (${x.total}x nas últimas 24 h)`;
const hubLogText = x =>
  [x.operacao || x.rota, x.status ? `HTTP ${x.status}` : null, x.mensagem].filter(Boolean).join(' — ');

function NotificationCard({ item, read, mark, showError, showTerminal, showCleanup }) {
  const cleanup = item.type === 'release_cleanup',
    hubLog = item.type === 'hub_log',
    hubAlert = item.type === 'hub_alert',
    title = hubAlert
      ? item.alert.titulo
      : hubLog
      ? hubLogTitle(item.hub)
      : cleanup
      ? 'Limpeza de versões antigas'
      : item.type === 'executable_hash'
        ? item.hashStatus === 'unauthorized'
          ? `Versão não homologada (${item.version})`
          : `Hash identifica a versão ${item.detectedVersion}, não ${item.version}`
        : `Erro corrigido voltou na versão ${item.version}`;
  return (
    <Box
      sx={{
        p: 2,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: read ? 'transparent' : 'action.hover'
      }}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
        <Box>
          <Typography fontWeight={read ? 400 : 700}>{title}</Typography>
          {!cleanup && (
            <Typography variant="body2" color="text.secondary">
              {fmt(item.receivedAt)} — {item.client}
            </Typography>
          )}
          <Typography variant="body2">{hubAlert ? item.alert.detalhe : hubLog ? hubLogText(item.hub) : item.message}</Typography>
        </Box>
        <Stack direction="row" alignItems="center" spacing={1}>
          {hubLog || hubAlert ? null : cleanup ? (
            <Button variant="contained" color="warning" onClick={showCleanup}>
              Revisar e excluir
            </Button>
          ) : (
            <>
              <Button size="small" onClick={() => showError(item)}>
                Erro #{item.id}
              </Button>
              <Button size="small" onClick={() => showTerminal(item)}>
                Terminal
              </Button>
            </>
          )}
          {!read && (
            <Button size="small" variant="outlined" onClick={() => mark(item)}>
              Marcar como lida
            </Button>
          )}
        </Stack>
      </Stack>
    </Box>
  );
}

function InfoDialog({ title, value, close, fields }) {
  return (
    <Dialog open={Boolean(value)} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} mt={1}>
          {(fields || []).map(([label, text]) => (
            <Box key={label}>
              <Typography variant="caption" color="text.secondary">
                {label}
              </Typography>
              <Typography sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text || '-'}</Typography>
            </Box>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Fechar</Button>
      </DialogActions>
    </Dialog>
  );
}
