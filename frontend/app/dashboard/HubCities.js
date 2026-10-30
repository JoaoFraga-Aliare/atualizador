'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  CloudDownload as CloudDownloadIcon,
  Edit as EditIcon,
  FilterList as FilterListIcon,
  Save as SaveIcon
} from '@mui/icons-material';
import { Grid } from './components';
import { IconAction, Notice, hubApi, hubError, hubSend, when } from './HubUi';

const PAGE = 50;
const states = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

function EditDialog({ city, close, done }) {
  const [form, setForm] = useState({
      nome: city.nome,
      uf: city.uf,
      codigoPais: String(city.codigoPais ?? ''),
      populacao: city.populacao ?? ''
    }),
    [error, setError] = useState('');
  async function save() {
    setError('');
    try {
      await hubSend(`/cidades/${city.codigo}`, 'PATCH', {
        nome: form.nome,
        uf: form.uf,
        codigoPais: Number(form.codigoPais),
        populacao: form.populacao === '' ? null : Number(form.populacao)
      });
      done();
    } catch (e) {
      setError(hubError(e).error);
    }
  }
  return (
    <Dialog open onClose={close} fullWidth maxWidth="xs">
      <DialogTitle>Cidade {city.codigo}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} mt={1}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Código (PDV/Agrosys)" value={city.codigo} disabled />
          <TextField label="Código IBGE" value={city.codigoIbge} disabled />
          <TextField label="Nome" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
          <TextField select label="UF" value={form.uf} onChange={e => setForm({ ...form, uf: e.target.value })}>
            {states.map(uf => (
              <MenuItem key={uf} value={uf}>
                {uf}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Código do país"
            type="number"
            value={form.codigoPais}
            onChange={e => setForm({ ...form, codigoPais: e.target.value })}
          />
          <TextField
            label="População"
            type="number"
            value={form.populacao}
            onChange={e => setForm({ ...form, populacao: e.target.value })}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancelar</Button>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          disabled={!form.nome.trim() || !form.codigoPais}
          onClick={save}
        >
          Salvar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// Hub > Cidades: cadastro unico (igual para todos os clientes e terminais), carregado do IBGE.
export default function HubCities({ admin }) {
  const [filters, setFilters] = useState({ busca: '', uf: '' }),
    [applied, setApplied] = useState({ busca: '', uf: '' }),
    [page, setPage] = useState(0),
    [data, setData] = useState(null),
    [notice, setNotice] = useState(null),
    [loading, setLoading] = useState(false),
    [editing, setEditing] = useState(null),
    load = useCallback(async () => {
      const qs = new URLSearchParams({ limite: String(PAGE), pagina: String(page) });
      if (applied.busca) qs.set('busca', applied.busca);
      if (applied.uf) qs.set('uf', applied.uf);
      try {
        setData(await hubApi(`/cidades?${qs}`));
      } catch (e) {
        setNotice(hubError(e));
      }
    }, [applied, page]);
  useEffect(() => {
    load();
  }, [load]);

  async function loadIbge() {
    setLoading(true);
    try {
      const r = await hubSend('/cidades/ibge/carregar', 'POST');
      setNotice({
        ok: `IBGE: ${r.lidas} municípios lidos, ${r.novas} nova(s), ${r.alteradas} alterado(s).`
      });
      await load();
    } catch (e) {
      setNotice(hubError(e));
    }
    setLoading(false);
  }

  const last = data?.ultimaCarga,
    pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1;
  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Cadastro único de cidades, igual para todos os clientes e terminais. O código é o do PDV (numeração interna do
        Agrosys); o código IBGE fica em coluna própria. Os PDVs recebem daqui pela sincronização; não é mais enviado por
        cliente.
      </Typography>
      <Notice value={notice} close={() => setNotice(null)} />
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          label="Nome, código ou IBGE"
          value={filters.busca}
          onChange={e => setFilters({ ...filters, busca: e.target.value })}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              setPage(0);
              setApplied(filters);
            }
          }}
        />
        <TextField
          select
          label="UF"
          value={filters.uf}
          onChange={e => setFilters({ ...filters, uf: e.target.value })}
          sx={{ minWidth: 110 }}
        >
          <MenuItem value="">Todas</MenuItem>
          {states.map(uf => (
            <MenuItem key={uf} value={uf}>
              {uf}
            </MenuItem>
          ))}
        </TextField>
        <Button
          variant="contained"
          startIcon={<FilterListIcon />}
          onClick={() => {
            setPage(0);
            setApplied(filters);
          }}
        >
          Filtrar
        </Button>
        {admin && (
          <Box sx={{ ml: 'auto' }}>
            <IconAction
              title={loading ? 'Consultando o IBGE…' : data?.total ? 'Atualizar pelo IBGE' : 'Carregar do IBGE'}
              icon={CloudDownloadIcon}
              disabled={loading}
              onClick={loadIbge}
            />
          </Box>
        )}
      </Box>
      {data && (
        <Typography variant="caption" color="text.secondary">
          {data.total} cidade(s)
          {last &&
            (last.erro
              ? ` · última carga com erro: ${last.erro}`
              : ` · última carga: ${when(last.iniciado_em)} (${last.lidas} lidas, ${last.novas} novas, ${last.alteradas} alteradas)`)}
        </Typography>
      )}
      <Grid
        heads={['Código (PDV)', 'Nome', 'UF', 'Código IBGE', 'País', 'População', ...(admin ? [''] : [])]}
        rows={(data?.itens || []).map(c => [
          c.codigo,
          c.nome,
          c.uf,
          c.codigoIbge,
          c.codigoPais,
          c.populacao ?? '—',
          ...(admin
            ? [
                <Tooltip key="e" title="Editar">
                  <IconButton size="small" onClick={() => setEditing(c)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ]
            : [])
        ])}
      />
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
      {editing && (
        <EditDialog
          city={editing}
          close={() => setEditing(null)}
          done={() => {
            setEditing(null);
            setNotice({ ok: 'Cidade salva. Os terminais recebem na próxima sincronização.' });
            load();
          }}
        />
      )}
    </Stack>
  );
}
