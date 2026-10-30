'use client';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Chip, MenuItem, Paper, Stack, TextField, Typography, Button } from '@mui/material';
import { Refresh as RefreshIcon, Visibility as VisibilityIcon } from '@mui/icons-material';
import { api } from '../../lib/api';
import { Grid } from './components';
import { IconAction, when } from './HubUi';
import { Detail } from './HubLogs';

const channels = { 'terminal->hub': 'PDV → Hub', 'hub->erp': 'Hub → Agrosys', 'cliente->hub': 'Cliente → Hub' };
const periods = [
  ['1h', 'Última hora'],
  ['24h', 'Últimas 24 horas'],
  ['7d', 'Últimos 7 dias'],
  ['30d', 'Últimos 30 dias']
];

function Metric({ label, value, color }) {
  return (
    <Box sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h5" fontWeight={700} color={color}>
        {value}
      </Typography>
    </Box>
  );
}

// Hub > Logs > Erros: o que falhou, em todos os clientes, do mais recente para o mais antigo.
export default function HubErrors() {
  const [filters, setFilters] = useState({ periodo: '24h', resultado: 'falha', canal: '', empresa: '', busca: '' }),
    [data, setData] = useState(null),
    [rows, setRows] = useState([]),
    [error, setError] = useState(''),
    [open, setOpen] = useState(null),
    [loading, setLoading] = useState(false),
    query = (extra = {}) => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries({ ...filters, ...extra })) if (v !== '' && v !== undefined && v !== null) params.set(k, v);
      return params.toString();
    },
    load = useCallback(async () => {
      setLoading(true);
      try {
        const r = await api(`/admin/hub/logs/errors?${query()}`);
        setData(r);
        setRows(r.itens);
        setError('');
      } catch (e) {
        setError(e.message === 'hub_not_configured' ? 'O Hub não está configurado no servidor.' : e.message);
      }
      setLoading(false);
    }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
  }, [load]);
  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }));
  async function more() {
    const r = await api(`/admin/hub/logs/errors?${query({ antes: data.proximo })}`);
    setData({ ...data, proximo: r.proximo });
    setRows(current => [...current, ...r.itens]);
  }

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      <Paper sx={{ p: { xs: 2, md: 3 } }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
          <TextField select label="Período" value={filters.periodo} onChange={e => set('periodo', e.target.value)} sx={{ minWidth: 180 }}>
            {periods.map(([v, l]) => (
              <MenuItem key={v} value={v}>
                {l}
              </MenuItem>
            ))}
          </TextField>
          <TextField select label="Tipo" value={filters.resultado} onChange={e => set('resultado', e.target.value)} sx={{ minWidth: 170 }}>
            <MenuItem value="falha">Erros e recusadas</MenuItem>
            <MenuItem value="erro">Só erros (falha técnica)</MenuItem>
            <MenuItem value="recusado">Só recusadas</MenuItem>
          </TextField>
          <TextField select label="Origem" value={filters.canal} onChange={e => set('canal', e.target.value)} sx={{ minWidth: 190 }}>
            <MenuItem value="">Todas</MenuItem>
            {Object.entries(channels).map(([v, l]) => (
              <MenuItem key={v} value={v}>
                {l}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Buscar (mensagem, rota, operação)"
            value={filters.busca}
            onChange={e => set('busca', e.target.value)}
            sx={{ flex: 1, minWidth: 200 }}
          />
          {filters.empresa && (
            <Chip label="Um cliente" onDelete={() => set('empresa', '')} color="primary" variant="outlined" />
          )}
          <IconAction title="Atualizar" icon={RefreshIcon} onClick={load} disabled={loading} />
        </Stack>
      </Paper>

      {data && (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' } }}>
          <Metric label="Total" value={data.resumo.total} />
          <Metric label="Erros (falha técnica)" value={data.resumo.erros} color={data.resumo.erros ? 'error.main' : undefined} />
          <Metric label="Recusadas" value={data.resumo.recusados} color={data.resumo.recusados ? 'warning.main' : undefined} />
          <Metric label="Do PDV" value={data.resumo.terminal} />
          <Metric label="Do Agrosys" value={data.resumo.erp} />
        </Box>
      )}
      {data?.porEmpresa?.length > 0 && !filters.empresa && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary" mb={1}>
            Clientes com mais ocorrências (clique para filtrar)
          </Typography>
          <Stack direction="row" gap={1} flexWrap="wrap">
            {data.porEmpresa.map(x => (
              <Chip key={x.id} label={`${x.nome || '—'} · ${x.total}`} clickable onClick={() => set('empresa', x.id)} />
            ))}
          </Stack>
        </Paper>
      )}

      <Grid
        heads={['Quando', 'Cliente', 'Origem', 'Operação', 'Resultado', 'Mensagem', '']}
        rows={rows.map(r => [
          when(r.ocorrido_em),
          r.empresa || '—',
          <Box key="o">
            {channels[r.canal] || r.canal}
            {r.terminal && (
              <Typography variant="caption" color="text.secondary" display="block">
                {r.terminal}
              </Typography>
            )}
          </Box>,
          <Box key="p">
            <code>{r.operacao || r.rota}</code>
            {r.status_http && (
              <Typography variant="caption" color="text.secondary" display="block">
                HTTP {r.status_http}
              </Typography>
            )}
          </Box>,
          <Chip key="r" size="small" color={r.resultado === 'erro' ? 'error' : 'warning'} label={r.resultado} />,
          <Typography key="m" variant="body2" sx={{ maxWidth: 380 }} noWrap title={r.mensagem || ''}>
            {r.mensagem || '—'}
          </Typography>,
          <IconAction key="d" title="Ver detalhe" icon={VisibilityIcon} onClick={() => setOpen(r)} />
        ])}
      />
      {data && !rows.length && <Alert severity="success">Nenhuma ocorrência neste período.</Alert>}
      {data?.proximo && (
        <Box>
          <Button onClick={more}>Carregar mais</Button>
        </Box>
      )}
      {open && <Detail tenantId={open.tenant_id} logId={open.id} close={() => setOpen(null)} />}
    </Stack>
  );
}
