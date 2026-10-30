'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import {
  Add as AddIcon,
  Save as SaveIcon,
  DeleteOutline as DeleteOutlineIcon,
  Edit as EditIcon,
  PlayArrow as PlayArrowIcon,
  PowerSettingsNew as PowerSettingsNewIcon,
  Refresh as RefreshIcon,
  Replay as ReplayIcon,
  Visibility as VisibilityIcon,
  VpnKey as VpnKeyIcon
} from '@mui/icons-material';
import { Grid } from './components';
import { ActionButton, IconAction, Notice, SecretDialog, hubApi, hubError, hubSend, when } from './HubUi';

const eventLabels = { nota: 'Nota', 'movimento-caixa': 'Movimento de caixa', email: 'E-mail' };
const statusColor = { enviado: 'success', pendente: 'warning', falhou: 'error' };
const section = { p: { xs: 2, md: 3 } };

function WebhookDialog({ initial, events, close, save }) {
  const [form, setForm] = useState({
      nome: initial?.nome ?? '',
      url: initial?.url ?? '',
      eventos: initial?.eventos ?? []
    }),
    [error, setError] = useState(''),
    toggle = ev =>
      setForm(f => ({ ...f, eventos: f.eventos.includes(ev) ? f.eventos.filter(x => x !== ev) : [...f.eventos, ev] }));
  async function submit() {
    setError('');
    const result = await save(form);
    if (result?.error) setError(result.error);
  }
  return (
    <Dialog open onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>{initial ? 'Editar webhook' : 'Novo webhook'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} mt={1}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Nome"
            value={form.nome}
            onChange={e => setForm({ ...form, nome: e.target.value })}
            placeholder="ERP do cliente"
          />
          <TextField
            label="URL (https)"
            value={form.url}
            onChange={e => setForm({ ...form, url: e.target.value })}
            placeholder="https://erp.cliente.com.br/hub/webhook"
          />
          <Box>
            <Typography variant="subtitle2">Eventos</Typography>
            <Typography variant="caption" color="text.secondary">
              Nenhum marcado = todos os eventos.
            </Typography>
            <FormGroup>
              {events.map(ev => (
                <FormControlLabel
                  key={ev}
                  control={<Checkbox checked={form.eventos.includes(ev)} onChange={() => toggle(ev)} />}
                  label={`${eventLabels[ev] ?? ev} (${ev})`}
                />
              ))}
            </FormGroup>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancelar</Button>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          disabled={!form.nome.trim() || !form.url.trim()}
          onClick={submit}
        >
          Salvar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function DeliveryDialog({ tenantId, id, close }) {
  const [d, setD] = useState(null),
    [error, setError] = useState('');
  useEffect(() => {
    hubApi(`/tenants/${tenantId}/webhooks/entregas/${id}`)
      .then(setD)
      .catch(e => setError(hubError(e).error));
  }, [tenantId, id]);
  const pre = text => (
    <Box
      component="pre"
      sx={{ m: 0, maxHeight: 260, overflow: 'auto', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
    >
      {text}
    </Box>
  );
  return (
    <Dialog open onClose={close} fullWidth maxWidth="md">
      <DialogTitle>Entrega #{id}</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error">{error}</Alert>}
        {d && (
          <Stack spacing={2}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip size="small" label={d.evento} />
              <Chip size="small" color={statusColor[d.status]} label={d.status} />
              {d.codigo_http && <Chip size="small" label={`HTTP ${d.codigo_http}`} />}
              <Chip size="small" label={`${d.tentativas} tentativa(s)`} />
              {d.duracao_ms !== null && <Chip size="small" label={`${d.duracao_ms} ms`} />}
            </Box>
            <Typography variant="body2">
              {d.webhook} · <code>{d.url}</code> · {when(d.atualizado_em)}
            </Typography>
            {d.erro && <Alert severity="warning">{d.erro}</Alert>}
            <Box>
              <Typography variant="subtitle2">Enviado</Typography>
              {pre(JSON.stringify(d.corpo, null, 2))}
            </Box>
            <Box>
              <Typography variant="subtitle2">Resposta do destino</Typography>
              {d.resposta ? (
                pre(d.resposta)
              ) : (
                <Typography variant="body2" color="text.secondary">
                  —
                </Typography>
              )}
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Fechar</Button>
      </DialogActions>
    </Dialog>
  );
}

// Webhooks do cliente (origem API): tudo que o terminal devolve ao Hub e disparado por POST assinado.
export default function HubWebhooks({ tenantId, canEdit }) {
  const [data, setData] = useState(null),
    [deliveries, setDeliveries] = useState([]),
    [filter, setFilter] = useState({ webhook: '', status: '' }),
    [notice, setNotice] = useState(null),
    [editing, setEditing] = useState(null),
    [detail, setDetail] = useState(null),
    load = useCallback(async () => {
      const qs = new URLSearchParams({ limite: '50' });
      if (filter.webhook) qs.set('webhook', filter.webhook);
      if (filter.status) qs.set('status', filter.status);
      try {
        const [hooks, list] = await Promise.all([
          hubApi(`/tenants/${tenantId}/webhooks`),
          hubApi(`/tenants/${tenantId}/webhooks/entregas?${qs}`)
        ]);
        setData(hooks);
        setDeliveries(list);
      } catch (e) {
        setNotice(hubError(e));
      }
    }, [tenantId, filter]);
  useEffect(() => {
    load();
  }, [load]);

  const act =
    fn =>
    async (...args) => {
      let result;
      try {
        result = await fn(...args);
      } catch (e) {
        result = hubError(e);
      }
      setNotice(result);
      if (!result.error) await load();
      return result;
    };
  const create = act(async form => {
    const r = await hubSend(`/tenants/${tenantId}/webhooks`, 'POST', form);
    setEditing(null);
    return {
      ok: 'Webhook criado. Copie o segredo: ele aparece só agora e serve para conferir a assinatura.',
      secret: r.segredo
    };
  });
  const update = act(async (hook, body) => {
    await hubSend(`/tenants/${tenantId}/webhooks/${hook.id}`, 'PATCH', body);
    setEditing(null);
    return { ok: 'Webhook atualizado.' };
  });
  const remove = act(async hook => {
    await hubApi(`/tenants/${tenantId}/webhooks/${hook.id}`, { method: 'DELETE' });
    return { ok: 'Webhook removido.' };
  });
  const rotate = act(async hook => {
    const r = await hubSend(`/tenants/${tenantId}/webhooks/${hook.id}/segredo`, 'POST');
    return { ok: 'Novo segredo gerado; o anterior deixou de valer. Copie agora:', secret: r.segredo };
  });
  const test = act(async hook => {
    const r = await hubSend(`/tenants/${tenantId}/webhooks/${hook.id}/testar`, 'POST');
    return r.ok ? { ok: `Teste entregue (HTTP ${r.codigo}, ${r.ms} ms).` } : { error: `Teste falhou: ${r.erro}` };
  });
  const resend = act(async delivery => {
    const r = await hubSend(`/tenants/${tenantId}/webhooks/entregas/${delivery.id}/reenviar`, 'POST');
    return r.ok
      ? { ok: `Entrega #${delivery.id} reenviada (HTTP ${r.codigo}).` }
      : { error: `Reenvio falhou: ${r.erro}` };
  });

  if (!data)
    return <Stack spacing={2}>{notice ? <Notice value={notice} /> : <Typography>Carregando…</Typography>}</Stack>;
  const { webhooks, eventos } = data;
  return (
    <Stack spacing={3}>
      <Notice value={notice && { ...notice, secret: undefined }} close={() => setNotice(null)} />
      <SecretDialog value={notice} close={() => setNotice(null)} />
      <Paper sx={section}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          <Box>
            <Typography variant="h6">Webhooks</Typography>
            <Typography variant="body2" color="text.secondary">
              Tudo que o PDV devolve ao Hub (nota, movimento de caixa, e-mail) é enviado por POST para estas URLs, com
              assinatura HMAC. A resposta 2xx confirma o recebimento; falhas são repetidas até 8 vezes.
            </Typography>
          </Box>
          {canEdit && (
            <Box>
              <IconAction title="Novo webhook" icon={AddIcon} onClick={() => setEditing({})} />
            </Box>
          )}
        </Box>
        <Grid
          heads={['Nome', 'URL', 'Eventos', 'Segredo', 'Última entrega', 'Situação', 'Ações']}
          rows={webhooks.map(w => [
            w.nome,
            <code key="u" style={{ wordBreak: 'break-all' }}>
              {w.url}
            </code>,
            w.eventos.length ? w.eventos.map(e => eventLabels[e] ?? e).join(', ') : 'Todos',
            <code key="s">{w.segredo_prefixo}…</code>,
            w.ultima_entrega ? (
              <Chip
                key="l"
                size="small"
                color={statusColor[w.ultima_entrega.status]}
                label={`${w.ultima_entrega.status}${w.ultima_entrega.codigo_http ? ` · ${w.ultima_entrega.codigo_http}` : ''}`}
              />
            ) : (
              '—'
            ),
            <Chip
              key="a"
              size="small"
              color={w.ativo ? 'success' : 'default'}
              label={w.ativo ? 'ativo' : 'desativado'}
            />,
            canEdit ? (
              <Box key="b" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <ActionButton label="Testar" icon={PlayArrowIcon} run={() => test(w)} />
                <IconAction title="Editar" icon={EditIcon} onClick={() => setEditing(w)} />
                <ActionButton
                  label={w.ativo ? 'Desativar' : 'Ativar'}
                  icon={PowerSettingsNewIcon}
                  color={w.ativo ? 'primary' : 'inherit'}
                  run={() => update(w, { ativo: !w.ativo })}
                />
                <ActionButton
                  label="Novo segredo"
                  icon={VpnKeyIcon}
                  confirm="Gerar um novo segredo? O anterior deixa de valer na hora."
                  run={() => rotate(w)}
                />
                <ActionButton
                  label="Excluir"
                  icon={DeleteOutlineIcon}
                  color="error"
                  confirm={`Excluir o webhook ${w.nome}?`}
                  run={() => remove(w)}
                />
              </Box>
            ) : (
              ''
            )
          ])}
        />
      </Paper>

      <Paper sx={section}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ flex: 1 }}>
            Entregas
          </Typography>
          <TextField
            select
            size="small"
            label="Webhook"
            value={filter.webhook}
            onChange={e => setFilter({ ...filter, webhook: e.target.value })}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">Todos</MenuItem>
            {webhooks.map(w => (
              <MenuItem key={w.id} value={w.id}>
                {w.nome}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Situação"
            value={filter.status}
            onChange={e => setFilter({ ...filter, status: e.target.value })}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">Todas</MenuItem>
            <MenuItem value="enviado">enviado</MenuItem>
            <MenuItem value="pendente">pendente</MenuItem>
            <MenuItem value="falhou">falhou</MenuItem>
          </TextField>
          <IconAction title="Atualizar" icon={RefreshIcon} onClick={load} />
        </Box>
        <Grid
          heads={['#', 'Quando', 'Webhook', 'Evento', 'Situação', 'HTTP', 'Tentativas', 'Erro', '']}
          rows={deliveries.map(e => [
            e.id,
            when(e.criado_em),
            e.webhook,
            e.evento,
            <Chip key="s" size="small" color={statusColor[e.status]} label={e.status} />,
            e.codigo_http ?? '—',
            e.tentativas,
            e.erro ?? '',
            <Box key="d" sx={{ display: 'flex', gap: 1 }}>
              <IconAction title="Ver entrega" icon={VisibilityIcon} onClick={() => setDetail(e.id)} />
              {canEdit && e.status !== 'enviado' && (
                <ActionButton label="Reenviar" icon={ReplayIcon} run={() => resend(e)} />
              )}
            </Box>
          ])}
        />
      </Paper>

      {editing && (
        <WebhookDialog
          key={editing.id ?? 'novo'}
          initial={editing.id ? editing : null}
          events={eventos}
          close={() => setEditing(null)}
          save={form => (editing.id ? update(editing, form) : create(form))}
        />
      )}
      {detail && <DeliveryDialog tenantId={tenantId} id={detail} close={() => setDetail(null)} />}
    </Stack>
  );
}
