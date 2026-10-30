'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
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
  Logout as LogoutIcon,
  Menu as MenuIcon
} from '@mui/icons-material';
import LogDialog from './LogDialog';
import Products from './Products';
import Errors from './Errors';
import ApiTokens from './ApiTokens';
import CiArtifacts from './CiArtifacts';
import ClientTerminalsDialog from './ClientTerminalsDialog';
import Home from './Home';
import NotificationsBell from './NotificationsBell';
import ReleaseDialog from './ReleaseDialog';
import Sidebar, { viewTitle } from './Sidebar';
import { Grid } from './components';
import { allowedChannels, storeAllowedChannels, fmt, formatDocument } from './format';
import { api } from '../../lib/api';
import { setDebug, syncDebugFromUrl } from '../../lib/debug-data';
import { ReleasedVersions } from './Releases';
import { Users, UserDialog } from './Users';
import { HubUsers, HubUserDialog } from './HubUsers';
import HubClients from './HubClients';
import HubDocs from './HubDocsShell';
import HubCities from './HubCities';
import HubLogsAdmin from './HubLogsAdmin';
import { parsePath, pathOf } from './routes';

export default function Dashboard() {
  const router = useRouter(),
    [path, setPath] = useState(null),
    [logTab, setLogTab] = useState('errors'),
    [menuOpen, setMenuOpen] = useState(false),
    [data, setData] = useState({
      stats: {},
      clients: [],
      products: [],
      releases: [],
      logs: [],
      errorSettings: {},
      users: [],
      hubUsers: []
    }),
    [me, setMe] = useState(null),
    [terminals, setTerminals] = useState([]),
    [client, setClient] = useState(null),
    [releaseOpen, setReleaseOpen] = useState(null),
    [userOpen, setUserOpen] = useState(false),
    [hubUserOpen, setHubUserOpen] = useState(false),
    [hubMe, setHubMe] = useState(null),
    [terminalLog, setTerminalLog] = useState(null),
    [terminalErrors, setTerminalErrors] = useState(null),
    [accountAnchor, setAccountAnchor] = useState(null),
    [statsFilter, setStatsFilter] = useState({ channels: [], stats: null }),
    [message, setMessage] = useState(''),
    [debug, setDebugOn] = useState(false);
  // Endereco real do navegador (ex.: /hub/clientes/<id>/logs/): a tela e o que vem depois dela saem dele.
  const { view, rest, known } = parsePath(path ?? '/dashboard'),
    go = (to, replace = false) => {
      history[replace ? 'replaceState' : 'pushState'](null, '', to);
      setPath(to.split(/[?#]/)[0]);
    };
  useEffect(() => {
    const sync = () => setPath(location.pathname);
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  useEffect(() => {
    if (path !== null && !known) go(pathOf('home'), true);
  }, [path, known]);
  async function load() {
    try {
      const current = await api('/admin/me');
      storeAllowedChannels(current);
      // Desenvolvedor do Hub: nao usa os dados do sistema (produtos, versoes, erros...).
      if (current.hub_role) {
        setHubMe(await api('/admin/hub/me').catch(() => null));
        setMe(current);
        if (!location.pathname.startsWith('/hub')) go(pathOf('hub-clients'), true);
        return;
      }
      const requests = [
        api('/admin/dashboard'),
        api('/admin/clients'),
        api('/admin/products'),
        api('/admin/releases'),
        api('/admin/logs?limit=500'),
        api('/admin/errors/settings')
      ];
      if (current.role === 'admin') {
        requests.push(api('/admin/users'));
        // O Hub e outro servico: se estiver fora do ar, o restante do painel segue funcionando.
        requests.push(api('/admin/hub/users').catch(() => []));
        requests.push(api('/admin/hub/me').catch(() => null));
      }
      const [stats, clients, products, releases, logs, errorSettings, users = [], hubUsers = [], hubProfile = null] =
        await Promise.all(requests);
      setHubMe(hubProfile);
      setMe(current);
      setData({ stats, clients, products, releases, logs, errorSettings, users, hubUsers });
      setStatsFilter({ channels: allowedChannels(), stats: null });
    } catch (e) {
      setMessage(e.message);
    }
  }
  useEffect(() => {
    setDebugOn(syncDebugFromUrl());
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
  const admin = me?.role === 'admin',
    developer = me?.hub_role === 'developer',
    done = text => {
      setMessage(text);
      setReleaseOpen(null);
      setUserOpen(false);
      setHubUserOpen(false);
      load();
    },
    select = id => {
      setMenuOpen(false);
      go(pathOf((id === 'users' || id === 'hub-users' || id === 'hub-logs') && !admin ? 'home' : id));
    },
    // Sem permissao para a tela do endereco: volta ao inicio.
    blocked = me && !admin && (view === 'users' || view === 'hub-users' || view === 'hub-logs'),
    section = (title, content) => (
      <Paper sx={{ p: { xs: 2, md: 3 } }}>
        {title && (
          <Typography variant="h6" mb={2}>
            {title}
          </Typography>
        )}
        {content}
      </Paper>
    );
  useEffect(() => {
    if (blocked) go(pathOf('home'), true);
  }, [blocked]);
  if (path === null) return null;
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar
        view={view}
        admin={admin}
        developer={developer}
        onSelect={select}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <AppBar position="sticky" color="inherit" elevation={0}>
          <Toolbar sx={{ gap: 1 }}>
            <IconButton edge="start" aria-label="Abrir menu" onClick={() => setMenuOpen(open => !open)}>
              <MenuIcon />
            </IconButton>
            <Box component="img" src="/logo.png" alt="Agrosys" sx={{ height: 28, width: 'auto', mr: 0.5 }} />
            <Typography sx={{ flex: 1, fontWeight: 700, letterSpacing: '-.01em' }}>
              {viewTitle(view, admin, developer)}
            </Typography>
            <NotificationsBell admin={admin} />
            <Button
              color="inherit"
              startIcon={<AccountCircleIcon />}
              onClick={e => setAccountAnchor(e.currentTarget)}
              sx={{ textTransform: 'none', textAlign: 'left', borderRadius: 2, px: 1.5 }}
            >
              <Box>
                <Typography variant="body2" fontWeight={700} lineHeight={1.2}>
                  {me?.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {admin ? 'Administrador' : developer ? 'Player' : 'Operador'}
                </Typography>
              </Box>
            </Button>
            <Menu anchorEl={accountAnchor} open={!!accountAnchor} onClose={() => setAccountAnchor(null)}>
              <MenuItem
                onClick={async () => {
                  await api('/auth/logout', { method: 'POST', body: JSON.stringify({}) }).catch(() => {});
                  localStorage.clear();
                  router.push('/');
                }}
              >
                <LogoutIcon fontSize="small" sx={{ mr: 1.5 }} />
                Sair
              </MenuItem>
            </Menu>
          </Toolbar>
        </AppBar>
        <Box sx={{ maxWidth: 1600, mx: 'auto', p: '10px' }}>
          <Stack spacing={3}>
            {debug && (
              <Alert
                severity="warning"
                action={
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() => {
                      setDebug(false);
                      location.href = '/dashboard/';
                    }}
                  >
                    Sair do debug
                  </Button>
                }
              >
                Modo debug: os dados exibidos são fictícios e nada é enviado ao servidor.
              </Alert>
            )}
            {message && <Alert onClose={() => setMessage('')}>{message}</Alert>}
            {view === 'home' && !developer && (
              <Home
                admin={admin}
                data={data}
                stats={statsFilter.stats || data.stats}
                selectedChannels={statsFilter.channels}
                toggleChannel={toggleStatsChannel}
                showClient={showClient}
                done={done}
              />
            )}
            {view === 'clients' &&
              section(
                'Clientes',
                <Grid
                  heads={['Cliente', 'Documento', 'Terminais', 'Último contato', 'Ações']}
                  rows={data.clients.map(c => [
                    c.name,
                    c.document ? formatDocument(c.document) : '-',
                    c.terminal_count,
                    fmt(c.last_seen_at),
                    <Tooltip key={c.id} title="Ver terminais">
                      <IconButton onClick={() => showClient(c)}>
                        <DevicesIcon />
                      </IconButton>
                    </Tooltip>
                  ])}
                />
              )}
            {view === 'releases' &&
              section(
                'Versões',
                <ReleasedVersions
                  items={data.releases}
                  products={data.products}
                  clients={data.clients}
                  create={() => setReleaseOpen({ manual: true })}
                  done={done}
                />
              )}
            {view === 'ci' &&
              section(
                'CI/CD',
                <CiArtifacts release={artifact => setReleaseOpen(artifact || { manual: true })} notify={done} />
              )}
            {view === 'products' && section('Produtos', <Products items={data.products} admin={admin} done={done} />)}
            {view === 'logs-errors' &&
              section(
                null,
                <>
                  <Tabs value={logTab} onChange={(_, v) => setLogTab(v)} sx={{ mb: 2 }}>
                    <Tab value="errors" label="Erros" />
                    <Tab value="logs" label="Logs" />
                  </Tabs>
                  {logTab === 'errors' && <Errors settings={data.errorSettings} admin={admin} done={done} />}
                  {logTab === 'logs' && (
                    <Grid
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
                  )}
                </>
              )}
            {view === 'users' &&
              admin &&
              section('Usuários', <Users items={data.users} create={() => setUserOpen(true)} done={done} />)}
            {view === 'hub-clients' &&
              section(null, <HubClients hubMe={hubMe} notify={setMessage} segments={rest} go={go} />)}
            {view === 'hub-docs' && section(null, <HubDocs segments={rest} go={go} />)}
            {view === 'hub-cities' && section(null, <HubCities admin={admin} />)}
            {view === 'hub-logs' && admin && <HubLogsAdmin go={go} />}
            {view === 'hub-users' &&
              admin &&
              section(null, <HubUsers items={data.hubUsers} create={() => setHubUserOpen(true)} done={done} />)}
            {view === 'tokens' && section('Tokens CI/CD', <ApiTokens products={data.products} />)}
          </Stack>
        </Box>
      </Box>
      <ReleaseDialog
        open={!!releaseOpen}
        selectedArtifact={releaseOpen?.id ? releaseOpen : null}
        close={() => setReleaseOpen(null)}
        clients={data.clients}
        products={data.products}
        done={() => done('Versão publicada')}
      />
      <UserDialog
        open={userOpen}
        close={() => setUserOpen(false)}
        products={data.products}
        done={() => done('Usuário cadastrado')}
      />
      <HubUserDialog
        open={hubUserOpen}
        close={() => setHubUserOpen(false)}
        done={() => done('Player cadastrado')}
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
              admin={admin}
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
    </Box>
  );
}
