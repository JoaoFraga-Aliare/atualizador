'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  Toolbar,
  Tooltip,
  Typography
} from '@mui/material';
import {
  AccountCircle as AccountCircleIcon,
  Devices as DevicesIcon,
  Inventory2 as InventoryIcon,
  LockOpen as LockOpenIcon,
  People as PeopleIcon,
  ReceiptLong as ReceiptLongIcon
} from '@mui/icons-material';
import LogDialog from './LogDialog';
import Products from './Products';
import Errors from './Errors';
import ClientTerminalsDialog from './ClientTerminalsDialog';
import NotificationsBell from './NotificationsBell';
import ApiTokenDialog from './ProfileTokenDialog';
import ReleaseDialog from './ReleaseDialog';
import { StatsCards, Grid } from './components';
import { allowedChannels, storeAllowedChannels, fmt } from './format';
import { api } from '../../lib/api';
import { Releases } from './Releases';
import { Users, UserDialog } from './Users';

export default function Dashboard() {
  const router = useRouter(),
    [view, setView] = useState('clients'),
    [data, setData] = useState({
      stats: {},
      clients: [],
      products: [],
      releases: [],
      logs: [],
      errorSettings: {},
      users: []
    }),
    [me, setMe] = useState(null),
    [terminals, setTerminals] = useState([]),
    [client, setClient] = useState(null),
    [releaseOpen, setReleaseOpen] = useState(null),
    [userOpen, setUserOpen] = useState(false),
    [tokenOpen, setTokenOpen] = useState(false),
    [terminalLog, setTerminalLog] = useState(null),
    [terminalErrors, setTerminalErrors] = useState(null),
    [accountAnchor, setAccountAnchor] = useState(null),
    [statsFilter, setStatsFilter] = useState({ channels: [], stats: null }),
    [message, setMessage] = useState('');
  async function load() {
    try {
      const current = await api('/admin/me');
      storeAllowedChannels(current);
      const requests = [
        api('/admin/dashboard'),
        api('/admin/clients'),
        api('/admin/products'),
        api('/admin/releases'),
        api('/admin/logs?limit=500'),
        api('/admin/errors/settings')
      ];
      if (current.role === 'admin') requests.push(api('/admin/users'));
      const [stats, clients, products, releases, logs, errorSettings, users = []] = await Promise.all(requests);
      setMe(current);
      setData({ stats, clients, products, releases, logs, errorSettings, users });
      setStatsFilter({ channels: allowedChannels(), stats: null });
    } catch (e) {
      setMessage(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function showClient(c) {
    try {
      setClient(c);
      setTerminals(await api(`/admin/clients/${c.id}/terminals`));
    } catch (e) {
      setMessage(e.message);
    }
  }
  async function showLog(t) {
    try {
      setTerminalLog({ terminal: t, items: await api(`/admin/terminals/${t.id}/logs`) });
    } catch (e) {
      setMessage(e.message);
    }
  }
  async function toggleStatsChannel(channel) {
    try {
      const channels = statsFilter.channels.includes(channel)
          ? statsFilter.channels.filter(item => item !== channel)
          : [...statsFilter.channels, channel],
        stats = channels.length
          ? await api(`/admin/dashboard?channel=${channels.join(',')}`)
          : { clients: 0, terminals: 0, releases: 0, errors: 0 };
      setStatsFilter({ channels, stats });
    } catch {}
  }
  const done = text => {
      setMessage(text);
      setReleaseOpen(null);
      setUserOpen(false);
      load();
    },
    choose = value => {
      setAccountAnchor(null);
      setView(value);
    },
    primary = ['clients', 'releases', 'errors'].includes(view) ? view : false;
  return (
    <>
      <AppBar position="sticky" color="inherit" elevation={0}>
        <Toolbar>
          <Typography sx={{ flex: 1, fontWeight: 700 }}>Central de Atualização</Typography>
          <NotificationsBell />
          <Button
            color="inherit"
            startIcon={<AccountCircleIcon />}
            onClick={e => setAccountAnchor(e.currentTarget)}
            sx={{ textTransform: 'none', textAlign: 'left' }}
          >
            <Box>
              <Typography variant="body2" fontWeight={700} lineHeight={1.2}>
                {me?.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {me?.role === 'admin' ? 'Administrador' : 'Operador'}
              </Typography>
            </Box>
          </Button>
          <Menu anchorEl={accountAnchor} open={!!accountAnchor} onClose={() => setAccountAnchor(null)}>
            <MenuItem onClick={() => choose('products')}>
              <ListItemIcon>
                <InventoryIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Produtos</ListItemText>
            </MenuItem>
            {me?.role === 'admin' && (
              <MenuItem onClick={() => choose('users')}>
                <ListItemIcon>
                  <PeopleIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Usuários</ListItemText>
              </MenuItem>
            )}
            <MenuItem
              onClick={() => {
                setAccountAnchor(null);
                setTokenOpen(true);
              }}
            >
              <ListItemIcon>
                <LockOpenIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Token CI/CD</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => choose('logs')}>
              <ListItemIcon>
                <ReceiptLongIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Logs</ListItemText>
            </MenuItem>
            <Divider />
            <MenuItem
              onClick={async () => {
                await api('/auth/logout', { method: 'POST', body: JSON.stringify({}) }).catch(() => {});
                localStorage.clear();
                router.push('/');
              }}
            >
              Sair
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Stack spacing={3}>
          {message && <Alert onClose={() => setMessage('')}>{message}</Alert>}
          <StatsCards
            stats={statsFilter.stats || data.stats}
            selectedChannels={statsFilter.channels}
            toggleChannel={toggleStatsChannel}
          />
          <Paper>
            {primary && (
              <Tabs value={primary} onChange={(_, value) => setView(value)} variant="scrollable">
                <Tab value="clients" label="Clientes" />
                <Tab value="releases" label="Versões" />
                <Tab value="errors" label="Erros" />
              </Tabs>
            )}
            <Box sx={{ p: 3 }}>
              {view === 'clients' && (
                <Grid
                  heads={['Cliente', 'Documento', 'Terminais', 'Último contato', 'Ações']}
                  rows={data.clients.map(c => [
                    c.name,
                    c.document || '-',
                    c.terminal_count,
                    fmt(c.last_seen_at),
                    <Tooltip key={c.id} title="Ver terminais">
                      <IconButton onClick={() => showClient(c)}>
                        <DevicesIcon />
                      </IconButton>
                    </Tooltip>
                  ])}
                />
              )}{' '}
              {view === 'releases' && (
                <Releases
                  items={data.releases}
                  products={data.products}
                  clients={data.clients}
                  create={artifact => setReleaseOpen(artifact || { manual: true })}
                  done={done}
                />
              )}{' '}
              {view === 'errors' && <Errors settings={data.errorSettings} admin={me?.role === 'admin'} done={done} />}{' '}
              {view === 'products' && (
                <>
                  <Typography variant="h6" mb={2}>
                    Produtos
                  </Typography>
                  <Products items={data.products} admin={me?.role === 'admin'} done={done} />
                </>
              )}{' '}
              {view === 'logs' && (
                <>
                  <Typography variant="h6" mb={2}>
                    Logs
                  </Typography>
                  <Grid
                    showHome
                    heads={['Data', 'Status', 'Cliente', 'Terminal', 'Versão', 'Mensagem']}
                    rows={data.logs.map(l => [
                      fmt(l.created_at),
                      l.status,
                      l.client_name || '-',
                      l.terminal_name || '-',
                      l.target_version || '-',
                      l.message || '-'
                    ])}
                  />
                </>
              )}{' '}
              {view === 'users' && me?.role === 'admin' && (
                <>
                  <Typography variant="h6" mb={2}>
                    Usuários
                  </Typography>
                  <Users items={data.users} create={() => setUserOpen(true)} done={done} />
                </>
              )}
            </Box>
          </Paper>
        </Stack>
      </Container>
      <ReleaseDialog
        open={!!releaseOpen}
        selectedArtifact={releaseOpen?.id ? releaseOpen : null}
        close={() => setReleaseOpen(null)}
        clients={data.clients}
        products={data.products}
        done={() => done('Versão publicada')}
      />
      <ApiTokenDialog open={tokenOpen} close={() => setTokenOpen(false)} />
      <UserDialog
        open={userOpen}
        close={() => setUserOpen(false)}
        products={data.products}
        done={() => done('Usuário cadastrado')}
      />
      <ClientTerminalsDialog
        client={client}
        terminals={terminals}
        close={() => setClient(null)}
        showLog={showLog}
        showErrors={setTerminalErrors}
      />
      <LogDialog value={terminalLog} close={() => setTerminalLog(null)} />
      <Dialog open={!!terminalErrors} fullWidth maxWidth="xl" onClose={() => setTerminalErrors(null)}>
        <DialogTitle>Erros do terminal {terminalErrors?.name}</DialogTitle>
        <DialogContent>
          {terminalErrors && (
            <Errors
              settings={data.errorSettings}
              admin={me?.role === 'admin'}
              done={done}
              terminalId={terminalErrors.id}
              terminalLabel={terminalErrors.name}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTerminalErrors(null)}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
