'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Search as SearchIcon,
  Visibility as VisibilityIcon
} from '@mui/icons-material';
import { Grid } from './components';
import { IconAction, hubApi, hubError, when } from './HubUi';

const PAGE = 50;
const MAX_COLUMNS = 10;
const show = v => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

// Espelho: o que os terminais deste cliente recebem, por entidade (somente consulta).
function Entities({ tenantId, open }) {
  const [items, setItems] = useState(null),
    [error, setError] = useState('');
  useEffect(() => {
    hubApi(`/tenants/${tenantId}/espelho`)
      .then(setItems)
      .catch(e => setError(hubError(e).error));
  }, [tenantId]);
  if (error) return <Alert severity="error">{error}</Alert>;
  return (
    <Grid
      heads={['Entidade', 'Operação no PDV', 'Registros', 'Pausados', 'Atualizado', '']}
      rows={(items || []).map(e => [
        <Button key="n" onClick={() => open('dados', e.entidade)} sx={{ textTransform: 'none', fontWeight: 600 }}>
          {e.entidade}
        </Button>,
        e.operacao || '—',
        <>
          {e.total}
          {e.comum && <Chip size="small" label="comum" sx={{ ml: 1 }} />}
        </>,
        e.pausados || '',
        e.atualizado_em ? when(e.atualizado_em) : '—',
        e.total > 0 ? (
          <Tooltip key="v" title="Ver registros">
            <IconButton size="small" color="primary" onClick={() => open('dados', e.entidade)}>
              <VisibilityIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : (
          ''
        )
      ])}
    />
  );
}

function Rows({ tenantId, entity }) {
  const [search, setSearch] = useState(''),
    [applied, setApplied] = useState(''),
    [page, setPage] = useState(0),
    [data, setData] = useState(null),
    [error, setError] = useState(''),
    [detail, setDetail] = useState(null),
    load = useCallback(async () => {
      const qs = new URLSearchParams({ limite: String(PAGE), pagina: String(page) });
      if (applied) qs.set('busca', applied);
      try {
        setData(await hubApi(`/tenants/${tenantId}/espelho/${encodeURIComponent(entity)}?${qs}`));
        setError('');
      } catch (e) {
        setError(hubError(e).error);
      }
    }, [tenantId, entity, applied, page]);
  useEffect(() => {
    load();
  }, [load]);

  // Colunas: os campos da chave primeiro, depois os demais na ordem em que aparecem (ate o limite).
  const keys = data?.chave || [],
    seen = [...new Set((data?.itens || []).flatMap(i => Object.keys(i.dados)))],
    columns = [...keys, ...seen.filter(k => !keys.includes(k))].filter(k => seen.includes(k)).slice(0, MAX_COLUMNS),
    pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1;
  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          label="Buscar (chave ou qualquer campo)"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              setPage(0);
              setApplied(search.trim());
            }
          }}
          sx={{ minWidth: 280 }}
        />
        <Button
          variant="contained"
          startIcon={<SearchIcon />}
          onClick={() => {
            setPage(0);
            setApplied(search.trim());
          }}
        >
          Buscar
        </Button>
        {data && (
          <Typography variant="caption" color="text.secondary">
            {data.total} registro(s)
            {data.comum ? ' · cadastro comum a todos os clientes' : ' · os mais recentes primeiro'}
            {seen.length > columns.length
              ? ` · mostrando ${columns.length} de ${seen.length} campos (o resto no detalhe)`
              : ''}
          </Typography>
        )}
      </Box>
      <Box sx={{ overflowX: 'auto' }}>
        <Grid
          heads={[...columns, 'Atualizado', '']}
          rows={(data?.itens || []).map(i => [
            ...columns.map(c => show(i.dados[c])),
            <>
              {when(i.atualizado_em)}
              {i.pausado && <Chip size="small" color="warning" label="pausado" sx={{ ml: 1 }} />}
            </>,
            <Tooltip key="d" title="Ver registro completo">
              <IconButton size="small" onClick={() => setDetail(i)}>
                <VisibilityIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ])}
        />
      </Box>
      <Stack direction="row" spacing={1} alignItems="center">
        <IconAction
          title="Página anterior"
          icon={ChevronLeftIcon}
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        />
        <Typography variant="body2">
          Página {page + 1} de {pages}
        </Typography>
        <IconAction
          title="Próxima página"
          icon={ChevronRightIcon}
          disabled={page + 1 >= pages}
          onClick={() => setPage(page + 1)}
        />
      </Stack>
      {detail && (
        <Dialog open onClose={() => setDetail(null)} fullWidth maxWidth="sm">
          <DialogTitle>
            {entity} · {detail.chave}
          </DialogTitle>
          <DialogContent dividers>
            <Box component="pre" sx={{ m: 0, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {JSON.stringify(detail.dados, null, 2)}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDetail(null)}>Fechar</Button>
          </DialogActions>
        </Dialog>
      )}
    </Stack>
  );
}

export default function HubMirror({ tenantId, entity, open, back }) {
  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Tooltip title={entity ? 'Dados sincronizados' : 'Cliente'}>
          <IconButton color="primary" onClick={entity ? () => open('dados') : back}>
            <ArrowBackIcon />
          </IconButton>
        </Tooltip>
        <Typography variant="h5" component="h2">
          {entity ? `Dados sincronizados · ${entity}` : 'Dados sincronizados'}
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary">
        Espelho do que os terminais deste cliente recebem do Hub (somente consulta). Os campos aparecem com os nomes do
        PDV.
      </Typography>
      {entity ? (
        <Rows key={entity} tenantId={tenantId} entity={entity} />
      ) : (
        <Entities tenantId={tenantId} open={open} />
      )}
    </Stack>
  );
}
