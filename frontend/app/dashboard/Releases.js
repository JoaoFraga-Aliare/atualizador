'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import {
  Block as BlockIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  LockOpen as LockOpenIcon,
  MoreVert as MoreVertIcon,
  Percent as PercentIcon,
  Replay as ReplayIcon,
  Visibility as VisibilityIcon
} from '@mui/icons-material';
import CiArtifacts from './CiArtifacts';
import { Chip, PublishButton, Item, ConfirmDialog, Grid } from './components';
import { channels, fmt, fmtDay } from './format';
import { api } from '../../lib/api';

export function Releases(props) {
  const [tab, setTab] = useState('versions');
  return (
    <>
      <Tabs
        value={tab}
        onChange={(_, value) => setTab(value)}
        sx={{ mb: 2, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Tab value="versions" label="Versão" />
        <Tab value="cicd" label="CI/CD" />
      </Tabs>
      {tab === 'versions' ? (
        <ReleasedVersions {...props} create={() => props.create()} />
      ) : (
        <CiArtifacts release={props.create} notify={props.done} />
      )}
    </>
  );
}
function ReleasedVersions({ items, products, clients = [], create, done }) {
  const [product, setProduct] = useState(''),
    [channel, setChannel] = useState(''),
    [status, setStatus] = useState('active'),
    [details, setDetails] = useState(null),
    [copying, setCopying] = useState(null),
    [confirm, setConfirm] = useState(null),
    filtered = useMemo(
      () =>
        items.filter(
          r =>
            (!product || r.product_id === +product) &&
            (!channel || r.channel === channel) &&
            (status === 'deleted'
              ? Boolean(r.deleted_at)
              : status === 'blocked'
                ? !r.deleted_at && Boolean(r.blocked)
                : !r.deleted_at && !r.blocked)
        ),
      [items, product, channel, status]
    );
  async function change(r) {
    try {
      await api(`/admin/releases/${r.id}`, { method: 'PATCH', body: JSON.stringify({ blocked: !r.blocked }) });
      done(r.blocked ? 'Atualização liberada' : 'Atualização bloqueada');
    } catch (e) {
      done(e.message);
    }
  }
  async function changeRollout(r) {
    const value = prompt('Percentual de terminais que recebem esta versão (1 a 100):', r.rollout_percent ?? 100);
    if (value === null) return;
    try {
      await api(`/admin/releases/${r.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ rolloutPercent: Number(value) })
      });
      done(`Liberação gradual ajustada para ${Number(value)}%`);
    } catch (e) {
      done(e.message);
    }
  }
  async function askRemove(r) {
    try {
      const impact = await api(`/admin/releases/${r.id}/delete-impact`);
      setConfirm({
        title: 'Excluir versão',
        message: impact.canDelete
          ? `Excluir a versão ${r.version}? Há ${impact.events} evento(s) histórico(s), que serão preservados sem vínculo com a versão.`
          : `Não é possível excluir: ${impact.installations} terminal(is) utiliza(m) esta versão.`,
        allowYes: impact.canDelete,
        onYes: async () => {
          await api(`/admin/releases/${r.id}`, { method: 'DELETE' });
          done('Versão excluída');
        }
      });
    } catch (e) {
      done(e.message);
    }
  }
  async function view(r) {
    try {
      setDetails(await api(`/admin/releases/${r.id}/details`));
    } catch (e) {
      done(e.message);
    }
  }
  return (
    <>
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Produto</InputLabel>
            <Select label="Produto" value={product} onChange={e => setProduct(e.target.value)}>
              <MenuItem value="">Todos</MenuItem>
              {products.map(p => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Canal</InputLabel>
            <Select label="Canal" value={channel} onChange={e => setChannel(e.target.value)}>
              <MenuItem value="">Todos</MenuItem>
              {channels.map(c => (
                <MenuItem key={c} value={c}>
                  {c}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Status</InputLabel>
            <Select label="Status" value={status} onChange={e => setStatus(e.target.value)}>
              <MenuItem value="active">Ativas</MenuItem>
              <MenuItem value="blocked">Bloqueadas</MenuItem>
              <MenuItem value="deleted">Excluídas</MenuItem>
            </Select>
          </FormControl>
          <Box flex={1} />
          <PublishButton onClick={create} />
        </Stack>
        <Grid
          heads={['Produto', 'Versão', 'Canal', 'Destino', 'Terminais', 'Situação', 'Ações']}
          rows={filtered.map(r => [
            r.product_name,
            r.version,
            <Chip key="c" size="small" label={r.channel} />,
            (r.rollout_percent ?? 100) < 100 ? `${r.targets} · ${r.rollout_percent}%` : r.targets,
            r.terminal_count || 0,
            <Chip
              key="s"
              size="small"
              color={r.deleted_at ? 'default' : r.blocked ? 'error' : r.active ? 'success' : 'default'}
              label={r.deleted_at ? 'Excluída' : r.blocked ? 'Bloqueada' : r.active ? 'Ativa' : 'Inativa'}
            />,
            <Actions
              key={r.id}
              r={r}
              view={view}
              change={change}
              copy={setCopying}
              rollout={changeRollout}
              remove={askRemove}
            />
          ])}
        />
      </Stack>
      <Details value={details} close={() => setDetails(null)} />
      <CopyDialog release={copying} clients={clients} close={() => setCopying(null)} done={done} />
      <ConfirmDialog value={confirm} close={() => setConfirm(null)} />
    </>
  );
}
function Actions({ r, view, change, copy, rollout, remove }) {
  const [a, setA] = useState(null),
    run = fn => {
      setA(null);
      fn(r);
    };
  if (r.deleted_at)
    return (
      <Tooltip title="Visualizar histórico">
        <IconButton size="small" onClick={() => view(r)}>
          <VisibilityIcon />
        </IconButton>
      </Tooltip>
    );
  return (
    <>
      <Tooltip title="Ações">
        <IconButton size="small" onClick={e => setA(e.currentTarget)}>
          <MoreVertIcon />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={a} open={!!a} onClose={() => setA(null)}>
        <Item icon={<VisibilityIcon />} text="Visualizar" click={() => run(view)} />
        <MenuItem
          component="a"
          href={`/downloads/${r.file_path.split(/[/\\]/).map(encodeURIComponent).join('/')}`}
          download={r.original_name || r.file_path.split(/[/\\]/).pop()}
          onClick={() => setA(null)}
        >
          <ListItemIcon>
            <DownloadIcon />
          </ListItemIcon>
          <ListItemText>Baixar arquivo</ListItemText>
        </MenuItem>
        <Item
          icon={r.blocked ? <LockOpenIcon /> : <BlockIcon />}
          text={r.blocked ? 'Liberar' : 'Bloquear'}
          click={() => run(change)}
        />
        <Item icon={<PercentIcon />} text="Liberação gradual" click={() => run(rollout)} />
        <Item icon={<ReplayIcon />} text="Recadastrar" click={() => run(copy)} />
        <Divider />
        <Item icon={<DeleteIcon color="error" />} text="Excluir" click={() => run(remove)} color="error.main" />
      </Menu>
    </>
  );
}
function CopyDialog({ release, clients, close, done }) {
  const initial = r => ({
      version: r?.version || '',
      channel: r?.channel || 'production',
      targetType: 'all',
      targetClientIds: [],
      mandatory: Boolean(r?.mandatory),
      deadlineAt: '',
      minimumVersion: r?.minimum_version || '',
      rolloutPercent: 100,
      notes: r?.notes || '',
      technicalNotes: r?.technical_notes || '',
      showNotesPdv: Boolean(r?.show_notes_pdv)
    }),
    [form, setForm] = useState(initial(null)),
    [error, setError] = useState('');
  useEffect(() => {
    if (release) {
      const tomorrow = new Date(Date.now() + 86400000);
      setForm({
        ...initial(release),
        deadlineAt: new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
      });
      setError('');
    }
  }, [release]);
  const set = (k, v) => setForm(x => ({ ...x, [k]: v }));
  async function send() {
    try {
      await api(`/admin/releases/${release.id}/copy`, {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          version: form.version.trim(),
          deadlineAt: new Date(form.deadlineAt).toISOString()
        })
      });
      close();
      done('Versão recadastrada');
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <Dialog open={!!release} onClose={close} fullWidth>
      <DialogTitle>Recadastrar versão {release?.version}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} mt={1}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Versão" value={form.version} onChange={e => set('version', e.target.value)} />
          <FormControl>
            <InputLabel>Canal</InputLabel>
            <Select label="Canal" value={form.channel} onChange={e => set('channel', e.target.value)}>
              {channels.map(c => (
                <MenuItem key={c} value={c}>
                  {c}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl>
            <InputLabel>Liberação</InputLabel>
            <Select label="Liberação" value={form.targetType} onChange={e => set('targetType', e.target.value)}>
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
                {clients.map(c => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <FormControlLabel
            control={<Switch checked={form.mandatory} onChange={e => set('mandatory', e.target.checked)} />}
            label="Obrigatória"
          />
          <TextField
            type="datetime-local"
            label="Prazo"
            InputLabelProps={{ shrink: true }}
            value={form.deadlineAt}
            onChange={e => set('deadlineAt', e.target.value)}
          />
          <TextField
            label="Versão mínima"
            value={form.minimumVersion}
            onChange={e => set('minimumVersion', e.target.value)}
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
            multiline
            rows={3}
            label="Nota do painel"
            helperText="Uso interno; não é enviada ao PDV."
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
          />
          <TextField
            multiline
            rows={4}
            label="Nota técnica da atualização"
            value={form.technicalNotes}
            onChange={e => set('technicalNotes', e.target.value)}
          />
          <FormControlLabel
            control={<Switch checked={form.showNotesPdv} onChange={e => set('showNotesPdv', e.target.checked)} />}
            label="Exibir nota técnica no PDV"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancelar</Button>
        <Button
          variant="contained"
          onClick={send}
          disabled={
            !form.version.trim() ||
            !form.deadlineAt ||
            (form.showNotesPdv && !form.technicalNotes.trim()) ||
            (form.targetType === 'client' && !form.targetClientIds.length)
          }
        >
          Recadastrar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function Details({ value, close }) {
  const [day, setDay] = useState(null);
  useEffect(() => setDay(null), [value]);
  if (!value) return null;
  const rows = value.installations
    .filter(x => x.day === day)
    .map(x => [x.client_name, x.terminal_name, x.computer_name || '-', fmt(x.created_at)]);
  return (
    <>
      <Dialog open fullWidth maxWidth="md" onClose={close}>
        <DialogTitle>
          Versão {value.version} — By {value.published_by_name || 'Não informado'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mt: 1 }}>
            {[
              ['Status', value.deleted_at ? 'Excluída' : value.blocked ? 'Bloqueada' : 'Ativa'],
              ['Excluída em', fmt(value.deleted_at)],
              ['Produto', `${value.product_name} (${value.product_code})`],
              ['Tipo', value.artifact_type === 'sql' ? 'Script SQL' : 'Pacote ZIP'],
              ['Canal', value.channel],
              ['Destino', value.targets],
              ['Liberação gradual', `${value.rollout_percent ?? 100}% dos terminais`],
              ['Arquivo para download', value.original_name || value.file_path],
              ['Tamanho', `${(value.size_bytes / 1024 / 1024).toFixed(2)} MB`],
              ['Versão mínima', value.minimum_version || '-'],
              ['Prazo', fmt(value.deadline_at)],
              ['Obrigatória', value.mandatory ? 'Sim' : 'Não'],
              ['Exibir nota no PDV', value.show_notes_pdv ? 'Sim' : 'Não'],
              ['SHA-256 do pacote', value.sha256],
              ['SHA-256 do PDV.exe', value.executable_sha256 || 'Não disponível — versão antiga ou pacote sem PDV.exe']
            ].map(x => (
              <Box key={x[0]}>
                <Typography variant="caption" color="text.secondary">
                  {x[0]}
                </Typography>
                <Typography sx={{ wordBreak: 'break-word' }}>{x[1]}</Typography>
              </Box>
            ))}
          </Box>
          <Typography variant="subtitle2" mt={3}>
            Nota do painel
          </Typography>
          <Typography sx={{ whiteSpace: 'pre-wrap' }}>{value.notes || 'Sem nota do painel.'}</Typography>
          <Typography variant="subtitle2" mt={3}>
            Nota técnica da atualização
          </Typography>
          <Typography sx={{ whiteSpace: 'pre-wrap' }}>{value.technical_notes || 'Sem nota técnica.'}</Typography>
          <ReleaseAnalytics value={value.analytics} />
          <Typography variant="subtitle2" mt={3} mb={1}>
            Clientes atualizados por dia
          </Typography>
          {value.days.length ? (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {value.days.map(d => (
                <Button key={d.day} variant="outlined" onClick={() => setDay(d.day)}>
                  {fmtDay(d.day)}: {d.client_count} cliente(s) / {d.terminal_count} terminal(is)
                </Button>
              ))}
            </Stack>
          ) : (
            <Typography color="text.secondary">Nenhuma instalação concluída registrada.</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>Fechar</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={!!day} fullWidth maxWidth="md" onClose={() => setDay(null)}>
        <DialogTitle>Atualizados em {fmtDay(day)}</DialogTitle>
        <DialogContent>
          <Grid heads={['Cliente', 'Terminal', 'Computador', 'Atualizado em']} rows={rows} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDay(null)}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
function ReleaseAnalytics({ value }) {
  if (!value) return null;
  return (
    <Stack spacing={2} mt={3}>
      <Typography variant="h6">Timeline e saúde da versão</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4,1fr)' }, gap: 1 }}>
        {[
          ['Dias em atividade', value.activeDays],
          ['Terminais que utilizaram', value.terminals],
          ['Terminais com erro', value.terminalsWithErrors],
          ['Percentual com erro', `${value.errorTerminalPercent}%`]
        ].map(([label, text]) => (
          <Paper key={label} sx={{ p: 1.5 }}>
            <Typography variant="caption" color="text.secondary">
              {label}
            </Typography>
            <Typography variant="h6">{text}</Typography>
          </Paper>
        ))}
      </Box>
      <Typography variant="subtitle2">Linha do tempo diária</Typography>
      {value.timeline.length ? (
        <Grid
          heads={['Data', 'Novos terminais', 'Erros registrados']}
          rows={value.timeline.map(x => [fmtDay(x.date), x.terminals, x.errors])}
        />
      ) : (
        <Typography color="text.secondary">Nenhuma atividade registrada.</Typography>
      )}
      <Typography variant="subtitle2">Top 5 erros registrados</Typography>
      {value.topErrors.length ? (
        <Grid
          heads={['Exceção', 'Mensagem', 'Ocorrências', 'Última ocorrência']}
          rows={value.topErrors.map(x => [x.exception, x.message, x.count, fmt(x.lastAt)])}
        />
      ) : (
        <Typography color="text.secondary">Nenhum erro vinculado a esta versão.</Typography>
      )}
    </Stack>
  );
}
