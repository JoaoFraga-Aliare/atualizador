'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  CloudDownload as CloudDownloadIcon,
  Save as SaveIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import { IconAction, Notice, hubApi, hubError, hubSend } from './HubUi';

const numbering = new Set(['con_ultimanota', 'con_ultimanfc']);
const isNumeric =def => def.tipo === 'inteiro' || def.tipo === 'decimal' || def.controle === 'minmax';

function Field({ def, value, fallback, change }) {
  const flex = `1 1 ${Math.max(Math.min(def.largura, 100), 25) * 3}px`,
    shown = value === undefined || value === null ? '' : String(value),
    base = {
      label: def.rotulo,
      title: def.campo,
      sx: { flex, minWidth: 180 },
      slotProps: { inputLabel: { shrink: true } }
    };
  if (def.tipo === 'booleano')
    return (
      <FormControlLabel
        sx={{ flex, minWidth: 180 }}
        title={def.campo}
        control={<Checkbox checked={value === true} onChange={e => change(e.target.checked)} />}
        label={def.rotulo}
      />
    );
  if (def.opcoes)
    return (
      <TextField
        {...base}
        select
        value={shown}
        onChange={e => change(e.target.value)}
        slotProps={{ inputLabel: { shrink: true }, select: { native: true } }}
      >
        <option value="">—</option>
        {def.opcoes.map((o, i) => (
          <option key={o} value={def.valorPorIndice ? String(i) : o}>
            {o}
          </option>
        ))}
      </TextField>
    );
  return (
    <TextField
      {...base}
      type={def.tipo === 'data' ? 'date' : isNumeric(def) ? 'number' : 'text'}
      value={shown}
      onChange={e => change(e.target.value)}
      placeholder={fallback !== undefined && fallback !== null ? `padrão da empresa: ${fallback}` : def.campo}
      helperText={
        def.listaDoDispositivo
          ? 'Depende da máquina (porta/modelo): informe o valor usado no PDV.'
          : numbering.has(def.campo)
            ? 'Último número emitido. O PDV só adota se for maior que o dele (ou se a série mudar).'
            : undefined
      }
      slotProps={{
        inputLabel: { shrink: true },
        htmlInput: {
          step: def.tipo === 'decimal' ? 'any' : undefined,
          min: def.controle === 'minmax' ? def.minimo : undefined,
          max: def.controle === 'minmax' ? def.maximo : undefined
        }
      }}
    />
  );
}

const show = v => (v === null || v === undefined ? '—' : v === true ? 'sim' : v === false ? 'não' : String(v));

// Trazer do Agrosys (PDVCONFIG2): mostra o que mudaria (de -> para) e so grava depois da confirmacao.
// O que a LN nao devolve continua manual; o certificado, se vier, e baixado e guardado cifrado.
function AgrosysImport({ tenantId, terminal, close, done }) {
  const [preview, setPreview] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    url = `/tenants/${tenantId}/terminals/${terminal.id}/config/agrosys`;
  useEffect(() => {
    hubSend(url, 'POST', {})
      .then(setPreview)
      .catch(e => setError(hubError(e).error));
  }, []);
  async function apply() {
    setBusy(true);
    try {
      const r = await hubSend(url, 'POST', { aplicar: true });
      done(
        r.mudou || r.certificado?.existe
          ? `Parâmetros trazidos do Agrosys (versão ${r.versao}).${r.avisos?.length ? ' ' + r.avisos.join(' ') : ''}`
          : 'Nada mudou.'
      );
    } catch (e) {
      setError(hubError(e).error);
      setBusy(false);
    }
  }
  return (
    <Dialog open onClose={busy ? undefined : close} fullWidth maxWidth="md">
      <DialogTitle>Trazer do Agrosys — {terminal.nome}</DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {!preview && !error && (
          <Box sx={{ display: 'grid', placeItems: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        )}
        {preview && (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Valores que o Agrosys informa (PDVCONFIG2). O que ele não informa continua como está, manual.
            </Typography>
            {preview.mudancas.length ? (
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Parâmetro</TableCell>
                      <TableCell>Hoje</TableCell>
                      <TableCell>Agrosys</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {preview.mudancas.map(m => (
                      <TableRow key={m.campo}>
                        <TableCell>
                          {m.rotulo} <code>{m.campo}</code>
                        </TableCell>
                        <TableCell>{show(m.de)}</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>{show(m.para)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            ) : (
              <Alert severity="success">Os parâmetros já estão iguais ao Agrosys ({preview.semMudanca} conferidos).</Alert>
            )}
            {preview.faltando?.length > 0 && (
              <Alert severity="warning">
                Não cadastrado no Agrosys para esta unidade: {preview.faltando.join('; ')}. Esses dados ficam como estão
                (manuais) até serem cadastrados.
              </Alert>
            )}
            {preview.certificado?.disponivel && (
              <Alert severity="info">
                O Agrosys tem certificado ({preview.certificado.nome}). Ao aplicar, ele é baixado de{' '}
                {preview.certificado.local} e guardado cifrado, como no envio manual.
              </Alert>
            )}
            {preview.recusados?.length > 0 && (
              <Alert severity="warning">
                Não serão gravados (valor inválido): {preview.recusados.map(x => `${x.campo} (${x.erro})`).join('; ')}.
              </Alert>
            )}
            {preview.ignorados?.length > 0 && (
              <Typography variant="caption" color="text.secondary">
                Não importados: {preview.ignorados.map(x => `${x.campo} — ${x.motivo}`).join('; ')}.
              </Typography>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={busy}>
          Cancelar
        </Button>
        <Button
          variant="contained"
          startIcon={<CloudDownloadIcon />}
          disabled={!preview || busy || (!preview.mudancas.length && !preview.certificado?.disponivel)}
          onClick={apply}
        >
          {busy ? 'Aplicando…' : 'Aplicar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// Parametros do caixa ("Parametrizacao PDV"): grupos a esquerda, busca e campos por tipo.
// So os campos alterados sao enviados; vazio volta a herdar o padrao da empresa.
export default function HubTerminalConfig({ tenantId, terminal, back }) {
  const [config, setConfig] = useState(null),
    [defs, setDefs] = useState([]),
    [edits, setEdits] = useState({}),
    [group, setGroup] = useState(''),
    [search, setSearch] = useState(''),
    [notice, setNotice] = useState(null),
    [saving, setSaving] = useState(false),
    [importing, setImporting] = useState(false);

  async function load() {
    try {
      const cfg = await hubApi(`/tenants/${tenantId}/terminals/${terminal.id}/config`);
      setDefs(await hubApi(`/parametros?origem=${cfg.origem}`));
      setConfig(cfg);
      setEdits({});
    } catch (e) {
      setNotice(hubError(e));
    }
  }
  useEffect(() => {
    load();
  }, []);

  const groups = useMemo(() => [...new Set(defs.map(d => d.grupo))], [defs]);
  useEffect(() => {
    if (groups.length && !groups.includes(group)) setGroup(groups[0]);
  }, [groups, group]);

  async function save() {
    const valores = {};
    for (const [campo, raw] of Object.entries(edits)) {
      const def = defs.find(d => d.campo === campo);
      if (!def) continue;
      if (def.tipo === 'booleano') valores[campo] = raw === true;
      else if (String(raw ?? '').trim() === '') valores[campo] = null;
      else valores[campo] = isNumeric(def) || def.valorPorIndice ? Number(raw) : String(raw).trim();
    }
    setSaving(true);
    try {
      const r = await hubSend(`/tenants/${tenantId}/terminals/${terminal.id}/config`, 'PUT', { valores });
      setNotice({
        ok: r.mudou ? `Salvo (versão ${r.versao}). O terminal recebe na próxima sincronização.` : 'Nada mudou.'
      });
      await load();
    } catch (e) {
      setNotice(hubError(e));
    }
    setSaving(false);
  }

  const q = search.trim().toLowerCase(),
    matches = d => !q || d.rotulo.toLowerCase().includes(q) || d.campo.toLowerCase().includes(q),
    changed = Object.keys(edits),
    changedIn = g => changed.filter(c => defs.find(d => d.campo === c)?.grupo === g).length;

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Tooltip title="Cliente">
          <IconButton color="primary" onClick={back}>
            <ArrowBackIcon />
          </IconButton>
        </Tooltip>
        <Typography variant="h5" component="h2">
          Parâmetros — {terminal.nome}
        </Typography>
        {config && <Chip label={`Versão ${config.versao}`} />}
        {config?.origem === 'agrosys' && (
          <Box sx={{ ml: 'auto' }}>
            <IconAction title="Trazer do Agrosys" icon={CloudDownloadIcon} onClick={() => setImporting(true)} />
          </Box>
        )}
      </Box>
      {importing && (
        <AgrosysImport
          tenantId={tenantId}
          terminal={terminal}
          close={() => setImporting(false)}
          done={text => {
            setImporting(false);
            setNotice({ ok: text });
            load();
          }}
        />
      )}
      <Typography color="text.secondary">
        Antes ficavam na tabela <code>caixa</code> do PDV (tela “Parametrização PDV”). O terminal busca sozinho quando a
        versão muda. Campos vazios herdam o padrão da empresa, quando existir.
      </Typography>
      <Notice value={notice} close={() => setNotice(null)} />
      {config && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '280px 1fr' }, gap: 3, alignItems: 'start' }}>
          <Paper sx={{ p: 1.5 }}>
            <TextField
              fullWidth
              placeholder="Pesquisar parâmetro"
              value={search}
              onChange={e => setSearch(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  )
                }
              }}
              sx={{ mb: 1 }}
            />
            <List component="nav" disablePadding>
              {groups.map(g => {
                const active = !q && g === group,
                  n = changedIn(g);
                return (
                  <ListItemButton
                    key={g}
                    selected={active}
                    onClick={() => {
                      setSearch('');
                      setGroup(g);
                    }}
                    sx={{ borderRadius: 2, mb: 0.25 }}
                  >
                    <ListItemText primary={g} primaryTypographyProps={{ fontWeight: 600, fontSize: 14 }} />
                    {n > 0 && <Badge color="warning" badgeContent={n} sx={{ mr: 2 }} />}
                    <Typography variant="caption" color="text.secondary">
                      {defs.filter(d => d.grupo === g).length}
                    </Typography>
                  </ListItemButton>
                );
              })}
            </List>
          </Paper>
          <Paper sx={{ p: { xs: 2, md: 3 } }}>
            {groups.map(g => {
              const visible = defs.filter(d => d.grupo === g && matches(d)),
                show = q ? visible.length > 0 : g === group,
                subgroups = [...new Set(visible.map(d => d.subgrupo ?? ''))];
              return (
                <Box key={g} hidden={!show}>
                  <Typography variant="h6" mb={2}>
                    {g}
                  </Typography>
                  {subgroups.map(sg => (
                    <Box key={sg || '_'} sx={{ mb: 2 }}>
                      {sg && (
                        <Typography variant="subtitle2" color="text.secondary" mb={1.5}>
                          {sg}
                        </Typography>
                      )}
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                        {visible
                          .filter(d => (d.subgrupo ?? '') === sg)
                          .map(d => (
                            <Field
                              key={d.campo}
                              def={d}
                              value={d.campo in edits ? edits[d.campo] : config.valores[d.campo]}
                              fallback={config.padroes[d.campo]}
                              change={v => setEdits({ ...edits, [d.campo]: v })}
                            />
                          ))}
                      </Box>
                    </Box>
                  ))}
                </Box>
              );
            })}
            {q && !defs.some(matches) && <Typography color="text.secondary">Nenhum parâmetro encontrado.</Typography>}
            <Box
              sx={{
                mt: 3,
                pt: 2,
                borderTop: '1px solid #e4e8ee',
                display: 'flex',
                gap: 2,
                alignItems: 'center',
                flexWrap: 'wrap'
              }}
            >
              <Button variant="contained" startIcon={<SaveIcon />} disabled={saving || !changed.length} onClick={save}>
                {saving ? 'Salvando…' : 'Salvar alterações'}
              </Button>
              <Typography variant="body2" color="text.secondary">
                {changed.length ? `${changed.length} parâmetro(s) alterado(s)` : 'Nenhuma alteração'}
              </Typography>
            </Box>
          </Paper>
        </Box>
      )}
    </Stack>
  );
}
