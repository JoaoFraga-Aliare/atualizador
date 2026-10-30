'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  ExpandMore as ExpandMoreIcon,
  FilterList as FilterListIcon,
  FilterListOff as FilterListOffIcon,
  Visibility as VisibilityIcon
} from '@mui/icons-material';
import { Grid } from './components';
import { IconAction, hubApi, hubError, when } from './HubUi';

const LIMIT = 50;
const resultColor = { ok: 'success', recusado: 'warning', erro: 'error' };
const channels = { 'terminal->hub': 'Terminal → Hub', 'hub->erp': 'Hub → ERP', 'cliente->hub': 'Cliente → Hub' };

// Strings que contem JSON (ex.: "param" do SOAP) viram objeto, para nao aparecerem cheias de \".
const unwrap = v => {
  if (typeof v === 'string') {
    const t = v.trim();
    if (t.startsWith('{') || t.startsWith('['))
      try {
        return unwrap(JSON.parse(t));
      } catch {
        /* texto comum */
      }
    return v;
  }
  if (Array.isArray(v)) return v.map(unwrap);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unwrap(x)]));
  return v;
};
const pretty = text => {
  if (!text) return '';
  try {
    return JSON.stringify(unwrap(JSON.parse(text)), null, 2);
  } catch {
    return text;
  }
};

function Body({ title, text }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle2" mb={0.5}>
        {title}
      </Typography>
      {text ? (
        <Box
          component="pre"
          sx={{ m: 0, maxHeight: 280, overflow: 'auto', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
        >
          {pretty(text)}
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary">
          —
        </Typography>
      )}
    </Box>
  );
}

export function Detail({ tenantId, logId, close }) {
  const [detail, setDetail] = useState(null),
    [error, setError] = useState('');
  useEffect(() => {
    hubApi(`/tenants/${tenantId}/logs/${logId}`)
      .then(setDetail)
      .catch(e => setError(hubError(e).error));
  }, [tenantId, logId]);
  return (
    <Dialog open onClose={close} fullWidth maxWidth="md">
      <DialogTitle>Requisição #{logId}</DialogTitle>
      <DialogContent dividers>
        {!detail && !error && (
          <Box sx={{ display: 'grid', placeItems: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        {detail && (
          <>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              <Chip label={detail.canal} size="small" />
              <Chip label={detail.resultado} size="small" color={resultColor[detail.resultado] || 'default'} />
              {detail.status_http && <Chip label={`HTTP ${detail.status_http}`} size="small" />}
              {detail.duracao_ms !== null && <Chip label={`${detail.duracao_ms} ms`} size="small" />}
              {detail.itens !== null && <Chip label={`${detail.itens} item(ns)`} size="small" />}
              {detail.terminal && <Chip label={detail.terminal} size="small" />}
            </Box>
            <Typography variant="body2" mb={0.5}>
              {when(detail.ocorrido_em)} ·{' '}
              <code>
                {detail.metodo} {detail.rota}
              </code>
              {detail.operacao ? ` · ${detail.operacao}` : ''}
            </Typography>
            {detail.mensagem && (
              <Typography variant="body2" mb={2}>
                <strong>Mensagem:</strong> {detail.mensagem}
              </Typography>
            )}
            {detail.corpo_expirado ? (
              <Alert severity="info" sx={{ mb: 2 }}>
                O conteúdo enviado/recebido já expirou (fica disponível só por algumas horas). A requisição e o status
                continuam registrados.
              </Alert>
            ) : (
              <>
                {detail.corpo_expira_em && (
                  <Typography variant="caption" color="text.secondary" display="block" mb={2}>
                    Conteúdo disponível até {when(detail.corpo_expira_em)}. Senhas e tokens são ocultados.
                  </Typography>
                )}
                <Body title="Enviado" text={detail.req_corpo} />
                <Body title="Recebido" text={detail.resp_corpo} />
              </>
            )}
            {detail.relacionadas.length > 0 && (
              <>
                <Typography variant="subtitle2" mb={0.5}>
                  Chamadas relacionadas
                </Typography>
                {detail.relacionadas.map(r => (
                  <Typography key={r.id} variant="body2">
                    #{r.id} · {r.canal} · {r.operacao ?? ''} · {r.resultado} · {r.duracao_ms ?? 0} ms
                  </Typography>
                ))}
              </>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Fechar</Button>
      </DialogActions>
    </Dialog>
  );
}

// Log de requisicoes do cliente (terminal -> Hub, Hub -> ERP, cliente -> Hub) com filtros e detalhe.
export default function HubLogs({ tenantId, terminals, initial, back }) {
  const empty = { terminal: initial || '', canal: '', resultado: '', rota: '', ocultarVazias: '0' },
    [filters, setFilters] = useState(empty),
    [applied, setApplied] = useState(empty),
    [rows, setRows] = useState(null),
    [error, setError] = useState(''),
    [auto, setAuto] = useState(false),
    [open, setOpen] = useState(null);

  const load = useCallback(
    async (cursor = null) => {
      const qs = new URLSearchParams();
      for (const k of ['terminal', 'canal', 'resultado', 'rota']) if (applied[k]) qs.set(k, applied[k]);
      if (applied.ocultarVazias === '1') qs.set('ocultarVazias', '1');
      if (cursor) qs.set('antes', String(cursor));
      qs.set('limite', String(LIMIT));
      try {
        const page = await hubApi(`/tenants/${tenantId}/logs?${qs}`);
        setRows(current => (cursor ? [...(current || []), ...page] : page));
        setError('');
      } catch (e) {
        setError(hubError(e).error);
        setRows([]);
      }
    },
    [tenantId, applied]
  );
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(() => load(), 10000);
    return () => clearInterval(timer);
  }, [auto, load]);

  // atalho: aplica na hora o filtro de resultado (sem esperar o botao Filtrar)
  const quick = value => {
    setFilters(current => ({ ...current, resultado: value }));
    setApplied(current => ({ ...current, resultado: value }));
  };
  const set = (k, v) => setFilters({ ...filters, [k]: v }),
    field = { slotProps: { inputLabel: { shrink: true } }, sx: { minWidth: 170 } };
  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Tooltip title="Cliente">
          <IconButton color="primary" onClick={back}>
            <ArrowBackIcon />
          </IconButton>
        </Tooltip>
        <Typography variant="h5" component="h2">
          Log de requisições
        </Typography>
        <Box sx={{ flex: 1 }} />
        <FormControlLabel
          control={<Switch checked={auto} onChange={e => setAuto(e.target.checked)} />}
          label="Atualizar a cada 10 s"
        />
      </Box>
      <Paper sx={{ p: { xs: 2, md: 3 } }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
          <Chip label="Todos" color={applied.resultado === '' ? 'primary' : 'default'} onClick={() => quick('')} />
          <Chip
            label="Só os que deram erro"
            color={applied.resultado === 'falha' ? 'error' : 'default'}
            onClick={() => quick('falha')}
          />
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-end', mb: 3 }}>
          <TextField
            select
            label="Terminal"
            value={filters.terminal}
            onChange={e => set('terminal', e.target.value)}
            {...field}
          >
            <MenuItem value="">Todos</MenuItem>
            {terminals.map(t => (
              <MenuItem key={t.id} value={t.id}>
                {t.nome}
              </MenuItem>
            ))}
          </TextField>
          <TextField select label="Canal" value={filters.canal} onChange={e => set('canal', e.target.value)} {...field}>
            <MenuItem value="">Todos</MenuItem>
            {Object.entries(channels).map(([v, r]) => (
              <MenuItem key={v} value={v}>
                {r}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Resultado"
            value={filters.resultado}
            onChange={e => set('resultado', e.target.value)}
            {...field}
          >
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value="falha">com erro (erro + recusado)</MenuItem>
            <MenuItem value="ok">ok</MenuItem>
            <MenuItem value="recusado">recusado</MenuItem>
            <MenuItem value="erro">erro</MenuItem>
          </TextField>
          <TextField
            label="Rota ou operação"
            value={filters.rota}
            onChange={e => set('rota', e.target.value)}
            placeholder="PDVCLIENTE, /v1/sync…"
            {...field}
          />
          <TextField
            select
            label="Consultas sem novidade"
            value={filters.ocultarVazias}
            onChange={e => set('ocultarVazias', e.target.value)}
            {...field}
          >
            <MenuItem value="0">Mostrar</MenuItem>
            <MenuItem value="1">Ocultar</MenuItem>
          </TextField>
          <Button variant="contained" startIcon={<FilterListIcon />} onClick={() => setApplied(filters)}>
            Filtrar
          </Button>
          <IconAction
            title="Limpar filtros"
            icon={FilterListOffIcon}
            onClick={() => {
              setFilters({ ...empty, terminal: '' });
              setApplied({ ...empty, terminal: '' });
            }}
          />
        </Box>
        {error && <Alert severity="error">{error}</Alert>}
        <Grid
          heads={['Quando', 'Terminal', 'Canal', 'Operação', 'Resultado', 'Itens', 'Tempo', 'Mensagem', '']}
          rows={(rows || []).map(l => [
            when(l.ocorrido_em),
            l.terminal ?? '—',
            channels[l.canal] ?? l.canal,
            <code key="o">{l.operacao ?? l.rota}</code>,
            <Chip
              key="r"
              size="small"
              color={resultColor[l.resultado] ?? 'default'}
              label={l.status_http ? `${l.resultado} · ${l.status_http}` : l.resultado}
            />,
            l.itens ?? '',
            l.duracao_ms !== null ? `${l.duracao_ms} ms` : '',
            l.mensagem ?? '',
            <Tooltip key="d" title="Ver detalhes">
              <IconButton size="small" aria-label={`Detalhes da requisição ${l.id}`} onClick={() => setOpen(l.id)}>
                <VisibilityIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ])}
        />
        {rows?.length >= LIMIT && rows.length % LIMIT === 0 && (
          <Box sx={{ mt: 2 }}>
            <Button
              startIcon={<ExpandMoreIcon />}
              onClick={() => {
                load(rows[rows.length - 1].id);
              }}
            >
              Próximas {LIMIT}
            </Button>
          </Box>
        )}
        <Typography variant="caption" color="text.secondary" display="block" mt={2}>
          O conteúdo enviado/recebido fica disponível só por algumas horas; depois ficam a requisição e o status.
        </Typography>
      </Paper>
      {open && <Detail tenantId={tenantId} logId={open} close={() => setOpen(null)} />}
    </Stack>
  );
}
