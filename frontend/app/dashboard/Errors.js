'use client';
import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { ChevronLeft, ChevronRight, InfoOutlined, Search, Settings } from '@mui/icons-material';
import { api, apiBlob } from '../../lib/api';

const day = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10),
  today = () => day(new Date()),
  ago = n => day(new Date(Date.now() - n * 86400000)),
  fmt = v => (v ? new Date(v.includes('T') ? v : v.replace(' ', 'T') + 'Z').toLocaleString('pt-BR') : '-');

function Grid({ heads, rows }) {
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box sx={{ minWidth: 1100 }}>
        <Box
          sx={{ display: 'grid', gridTemplateColumns: `repeat(${heads.length},1fr)`, gap: 2, p: 1, fontWeight: 700 }}
        >
          {heads.map(x => (
            <Box key={x}>{x}</Box>
          ))}
        </Box>
        {rows.map((r, i) => (
          <Box
            key={i}
            sx={{
              display: 'grid',
              gridTemplateColumns: `repeat(${heads.length},1fr)`,
              gap: 2,
              p: 1.5,
              borderTop: '1px solid',
              borderColor: 'divider',
              alignItems: 'center'
            }}
          >
            {r.map((x, j) =>
              heads[j] === 'Mensagem' ? (
                <Typography
                  key={j}
                  role="button"
                  tabIndex={0}
                  onClick={r.at(-1)?.props?.onClick}
                  sx={{
                    maxWidth: 320,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    cursor: 'pointer',
                    '&:hover': { color: 'primary.main', textDecoration: 'underline' }
                  }}
                >
                  {x}
                </Typography>
              ) : (
                <Box key={j}>{x}</Box>
              )
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
function Filter({ label, value, items, set }) {
  return (
    <FormControl sx={{ minWidth: 150 }}>
      <InputLabel>{label}</InputLabel>
      <Select label={label} value={value} onChange={e => set(e.target.value)}>
        <MenuItem value="">Todos</MenuItem>
        {items.map(x => (
          <MenuItem key={x} value={x}>
            {x}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

export default function Errors({ settings = {}, admin, done, terminalId, terminalLabel }) {
  const [f, setF] = useState({
      startDate: ago(29),
      endDate: today(),
      exception: '',
      client: '',
      version: '',
      product: '',
      channel: '',
      includeIgnored: false
    }),
    [data, setData] = useState({ items: [], options: {} }),
    [detail, setDetail] = useState(null),
    [settingsOpen, setSettingsOpen] = useState(false),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    set = (k, v) => setF(x => ({ ...x, [k]: v }));
  async function load() {
    try {
      setLoading(true);
      const p = new URLSearchParams(Object.entries(f).map(([k, v]) => [k, String(v)]));
      setData(
        await api(`${terminalId ? `/admin/terminals/${terminalId}/errors/analysis` : '/admin/errors/analysis'}?${p}`)
      );
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function openDetail(x) {
    try {
      setDetail({ ...(await api(`/admin/errors/${x.id}`)), screenshots: x.screenshots || [] });
    } catch (e) {
      setError(e.message);
    }
  }
  async function save(v) {
    try {
      await api(`/admin/errors/${detail.id}/classification`, { method: 'PATCH', body: JSON.stringify(v) });
      setDetail(null);
      await load();
      done?.(v.ignored ? 'Erro descartado como não importante' : 'Tratamento do erro salvo');
    } catch (e) {
      setError(e.message);
    }
  }
  async function configure(v) {
    try {
      await api('/admin/errors/settings', { method: 'PATCH', body: JSON.stringify({ storeScreenshot: v }) });
      setSettingsOpen(false);
      done?.('Configuração atualizada');
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <>
      <Stack spacing={2}>
        <Stack direction="row" justifyContent="space-between">
          <Box>
            {!terminalLabel && <Typography variant="h6">Erros distintos</Typography>}
            <Typography variant="body2" color="text.secondary">
              {data.uniqueCount || 0} erro(s) distinto(s) em {data.occurrenceCount || 0} ocorrência(s).
            </Typography>
          </Box>
          {admin && (
            <Tooltip title="Configurações">
              <IconButton onClick={() => setSettingsOpen(true)}>
                <Settings />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
        {error && <Alert severity="error">{error}</Alert>}
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} flexWrap="wrap" useFlexGap>
          <TextField
            type="date"
            label="Data inicial"
            InputLabelProps={{ shrink: true }}
            value={f.startDate}
            onChange={e => set('startDate', e.target.value)}
          />
          <TextField
            type="date"
            label="Data final"
            InputLabelProps={{ shrink: true }}
            value={f.endDate}
            onChange={e => set('endDate', e.target.value)}
          />
          {[
            ['exception', 'Exceção', 'exceptions'],
            ['client', 'Cliente', 'clients'],
            ['version', 'Versão', 'versions'],
            ['product', 'Produto', 'products'],
            ['channel', 'Canal', 'channels']
          ].map(([k, l, o]) => (
            <Filter key={k} label={l} value={f[k]} items={data.options?.[o] || []} set={v => set(k, v)} />
          ))}
          <FormControlLabel
            control={<Switch checked={f.includeIgnored} onChange={e => set('includeIgnored', e.target.checked)} />}
            label="Mostrar descartados"
          />
          <IconButton disabled={loading} onClick={load}>
            <Search />
          </IconButton>
        </Stack>
        <Grid
          heads={['Última ocorrência', 'Cliente', 'Terminal', 'Versão', 'Exceção', 'Mensagem', 'Ocorrências', 'Ações']}
          rows={(data.items || []).map(x => [
            fmt(x.receivedAt),
            x.client,
            x.terminal,
            x.version,
            x.exception,
            x.message,
            x.occurrences,
            <Button key={x.id} onClick={() => openDetail(x)}>
              Visualizar
            </Button>
          ])}
        />
      </Stack>
      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)}>
        <DialogTitle>Configurações de erros</DialogTitle>
        <DialogContent>
          <FormControlLabel
            control={<Switch checked={Boolean(settings.storeScreenshot)} onChange={e => configure(e.target.checked)} />}
            label="Guardar prints criptografados"
          />
        </DialogContent>
      </Dialog>
      <Details value={detail} close={() => setDetail(null)} save={save} />
    </>
  );
}

function Carousel({ items = [] }) {
  const [index, setIndex] = useState(0),
    [images, setImages] = useState([]),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const urls = [];
    setIndex(0);
    setImages([]);
    setError('');
    Promise.all(
      items.map(async item => {
        const url = URL.createObjectURL(await apiBlob(`/admin/errors/${item.id}/screenshot`));
        urls.push(url);
        return { ...item, url };
      })
    )
      .then(x => active && setImages(x))
      .catch(e => active && setError(e.message));
    return () => {
      active = false;
      urls.forEach(URL.revokeObjectURL);
    };
  }, [items]);
  if (!items.length) return <Alert severity="info">Nenhum print foi armazenado para as ocorrências deste erro.</Alert>;
  if (error) return <Alert severity="error">Não foi possível carregar os prints: {error}</Alert>;
  if (!images.length) return <Typography color="text.secondary">Carregando {items.length} print(s)...</Typography>;
  const current = images[index],
    move = n => setIndex((index + n + images.length) % images.length),
    nav = {
      position: 'absolute',
      color: '#fff',
      bgcolor: 'rgba(0,0,0,.55)',
      '&:hover': { bgcolor: 'rgba(0,0,0,.75)' }
    };
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Box
        sx={{
          position: 'relative',
          display: 'grid',
          placeItems: 'center',
          minHeight: 260,
          bgcolor: '#111827',
          borderRadius: 1,
          overflow: 'hidden'
        }}
      >
        <Box
          component="img"
          src={current.url}
          alt={`Print ${index + 1} de ${images.length}`}
          sx={{ display: 'block', maxWidth: '100%', maxHeight: '65vh', objectFit: 'contain' }}
        />
        {images.length > 1 && (
          <>
            <IconButton aria-label="Print anterior" onClick={() => move(-1)} sx={{ ...nav, left: 8 }}>
              <ChevronLeft />
            </IconButton>
            <IconButton aria-label="Próximo print" onClick={() => move(1)} sx={{ ...nav, right: 8 }}>
              <ChevronRight />
            </IconButton>
          </>
        )}
      </Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mt={1}>
        <Typography variant="body2">
          Print {index + 1} de {images.length}
        </Typography>
        <Tooltip
          arrow
          title={
            <Box>
              <div>Cliente: {current.client}</div>
              <div>Terminal: {current.terminal}</div>
              <div>Data/hora: {fmt(current.receivedAt)}</div>
            </Box>
          }
        >
          <IconButton size="small" aria-label="Informações deste print">
            <InfoOutlined />
          </IconButton>
        </Tooltip>
      </Stack>
    </Paper>
  );
}

const mapStatusText = {
  no_address: 'O PDV não enviou endereço nem stack trace com endereços, então não foi possível consultar o .map.',
  package_not_found: 'O pacote desta versão não está mais disponível para consultar o .map.',
  map_not_found: 'O pacote desta versão não contém o arquivo .map do executável.',
  unresolved: 'Os endereços informados não correspondem a nenhum ponto do código no .map desta versão.',
  map_error: 'Não foi possível ler o .map desta versão.'
};

function MapAnalysis({ value }) {
  if (!value || (!value.frames?.length && !value.hints?.length && value.status === 'no_address')) return null;
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography fontWeight={700}>Análise do .map{value.map ? ` (${value.map})` : ''}</Typography>
      {value.status !== 'resolved' && (
        <Typography variant="body2" color="text.secondary" mt={1}>
          {mapStatusText[value.status] || ''}
        </Typography>
      )}
      {value.frames?.length > 0 && (
        <Stack spacing={1} mt={1}>
          {value.frames.map((frame, index) => (
            <Box key={index}>
              <Typography variant="body2" fontWeight={600}>
                {frame.kind === 'exception' ? 'Ponto da exceção' : `Chamada ${index}`}: {frame.procedure || frame.unit}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {frame.file || frame.unit}
                {frame.line ? `, linha ${frame.line}` : ''} · endereço {frame.address}
              </Typography>
            </Box>
          ))}
        </Stack>
      )}
      {value.hints?.length > 0 && (
        <Box mt={1.5}>
          <Typography variant="body2" fontWeight={600}>
            O que pode ser
          </Typography>
          {value.hints.map(hint => (
            <Typography key={hint} variant="body2">
              • {hint}
            </Typography>
          ))}
        </Box>
      )}
    </Paper>
  );
}

function Details({ value, close, save }) {
  const [ignored, setIgnored] = useState(false),
    [release, setRelease] = useState('');
  useEffect(() => {
    setIgnored(Boolean(value?.classification?.ignored));
    setRelease(value?.classification?.fixedReleaseId || '');
  }, [value]);
  if (!value) return null;
  return (
    <Dialog open fullWidth maxWidth="lg" onClose={close}>
      <DialogTitle>Erro #{value.id}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} mt={1}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            {[
              ['Recebido', fmt(value.received_at)],
              ['Cliente', value.client_name || '-'],
              ['Produto', value.product_code],
              ['Versão', value.version || '-'],
              ['Terminal', value.terminal || '-'],
              ['Exceção', value.exceptionClass || value.exception || '-']
            ].map(x => (
              <Box key={x[0]}>
                <Typography variant="caption" color="text.secondary">
                  {x[0]}
                </Typography>
                <Typography>{x[1]}</Typography>
              </Box>
            ))}
          </Box>
          <Typography sx={{ whiteSpace: 'pre-wrap' }}>
            <b>Mensagem</b>
            {'\n'}
            {value.message}
          </Typography>
          <Typography component="pre" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13 }}>
            <b>Stack trace</b>
            {'\n'}
            {value.stackTrace || 'Não informado.'}
          </Typography>
          <MapAnalysis value={value.mapAnalysis} />
          <Box>
            <Typography fontWeight={700} mb={1}>
              Prints das ocorrências
            </Typography>
            <Carousel items={value.screenshots} />
          </Box>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography fontWeight={700}>Tratamento deste erro</Typography>
            <FormControlLabel
              control={<Switch checked={ignored} onChange={e => setIgnored(e.target.checked)} />}
              label="Descartar como não importante"
            />
            <FormControl fullWidth sx={{ mt: 2 }} disabled={ignored}>
              <InputLabel>Versão que contém a correção</InputLabel>
              <Select label="Versão que contém a correção" value={release} onChange={e => setRelease(e.target.value)}>
                <MenuItem value="">Ainda não corrigido</MenuItem>
                {value.releases.map(r => (
                  <MenuItem key={r.id} value={r.id}>
                    {r.version} — {r.channel}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Typography variant="caption" color="text.secondary">
              Se voltar nessa versão ou em uma posterior, será marcado na Central de notificações.
            </Typography>
          </Paper>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancelar</Button>
        <Button variant="contained" onClick={() => save({ ignored, fixedReleaseId: ignored ? null : release || null })}>
          Salvar tratamento
        </Button>
      </DialogActions>
    </Dialog>
  );
}
