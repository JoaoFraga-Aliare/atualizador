'use client';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Checkbox, Chip, FormControlLabel, Paper, Stack, TextField, Typography } from '@mui/material';
import { Refresh as RefreshIcon, Save as SaveIcon } from '@mui/icons-material';
import { api } from '../../lib/api';
import { Notice, when } from './HubUi';

const explain = e => (e.message === 'hub_not_configured' ? 'O Hub não está configurado no servidor.' : e.message);
const limitFields = [
  ['terminalSemContatoHoras', 'Terminal sem contato há (horas)', 'Só terminais de produção que já conectaram.'],
  ['enviosParadosMin', 'Envios parados há (minutos)', 'Nota, caixa ou e-mail pendente ou com falha.'],
  ['certificadoDias', 'Certificado vence em (dias)', 'Avisa também quando já venceu.'],
  ['erpErros15min', 'Falhas do Agrosys em 15 min', 'Quantidade que abre o alerta.']
];

function AlertCard({ a, go }) {
  return (
    <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
        <Box>
          <Typography fontWeight={700}>{a.titulo}</Typography>
          <Typography variant="body2">{a.detalhe}</Typography>
          <Typography variant="caption" color="text.secondary">
            Aberto em {when(a.aberto_em)}
            {a.resolvido_em ? ` · resolvido em ${when(a.resolvido_em)}` : ''}
          </Typography>
        </Box>
        {a.tenant_id && !a.resolvido_em && (
          <Button size="small" onClick={() => go(`/hub/clientes/${a.tenant_id}/`)}>
            Abrir cliente
          </Button>
        )}
      </Stack>
    </Box>
  );
}

// Hub > Logs > Alertas: o que precisa de atencao agora (terminal sem contato, envios parados, certificado, Agrosys,
// webhook) e os limites de cada um. Os mesmos alertas aparecem no sino do painel.
export default function HubAlerts({ go }) {
  const [data, setData] = useState(null),
    [config, setConfig] = useState(null),
    [limits, setLimits] = useState({}),
    [on, setOn] = useState({}),
    [notice, setNotice] = useState(null),
    [busy, setBusy] = useState(false),
    applyConfig = useCallback(c => {
      setConfig(c);
      setLimits(c.alertas.limites);
      setOn(c.alertas.ligados);
    }, []),
    load = useCallback(async () => {
      try {
        const [alerts, cfg] = await Promise.all([api('/admin/hub/alerts'), api('/admin/hub/logs/config')]);
        setData(alerts);
        applyConfig(cfg);
      } catch (e) {
        setNotice({ error: explain(e) });
      }
    }, [applyConfig]);
  useEffect(() => {
    load();
  }, [load]);

  async function check() {
    setBusy(true);
    try {
      const r = await api('/admin/hub/alerts/check', { method: 'POST', body: JSON.stringify({}) });
      setData({ abertos: r.abertos, resolvidos: r.resolvidos });
      setNotice({ ok: r.novos ? `${r.novos} alerta(s) novo(s).` : 'Verificado: nada novo.' });
    } catch (e) {
      setNotice({ error: explain(e) });
    }
    setBusy(false);
  }
  async function save() {
    setBusy(true);
    try {
      const body = { alertas: { limites: Object.fromEntries(Object.entries(limits).map(([k, v]) => [k, Number(v)])), ligados: on } };
      applyConfig(await api('/admin/hub/logs/config', { method: 'PUT', body: JSON.stringify(body) }));
      setNotice({ ok: 'Limites salvos. Valem na próxima verificação (a cada minuto).' });
    } catch (e) {
      setNotice({ error: explain(e) });
    }
    setBusy(false);
  }

  if (!data || !config) return <Stack spacing={2}>{notice ? <Notice value={notice} /> : <Typography>Carregando…</Typography>}</Stack>;
  return (
    <Stack spacing={3}>
      <Notice value={notice} close={() => setNotice(null)} />
      <Paper sx={{ p: { xs: 2, md: 3 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
          <Box>
            <Typography variant="h6">Alertas abertos</Typography>
            <Typography variant="body2" color="text.secondary">
              O Hub confere a cada minuto e resolve o alerta sozinho quando o problema some.
            </Typography>
          </Box>
          <Button variant="outlined" startIcon={<RefreshIcon />} disabled={busy} onClick={check}>
            Verificar agora
          </Button>
        </Stack>
        {data.abertos.length ? (
          <Stack spacing={1.5}>
            {data.abertos.map(a => (
              <AlertCard key={a.chave} a={a} go={go} />
            ))}
          </Stack>
        ) : (
          <Alert severity="success">Nenhum alerta aberto.</Alert>
        )}
      </Paper>

      {data.resolvidos.length > 0 && (
        <Paper sx={{ p: { xs: 2, md: 3 } }}>
          <Typography variant="h6" mb={1.5}>
            Resolvidos nas últimas 24 h <Chip size="small" label={data.resolvidos.length} />
          </Typography>
          <Stack spacing={1.5}>
            {data.resolvidos.map(a => (
              <AlertCard key={`${a.chave}${a.resolvido_em}`} a={a} go={go} />
            ))}
          </Stack>
        </Paper>
      )}

      <Paper sx={{ p: { xs: 2, md: 3 } }}>
        <Typography variant="h6">Limites e tipos</Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Desligue o tipo que não interessa. Para receber o aviso fora do painel (Slack, Teams, Uptime Kuma), defina{' '}
          <code>HUB_ALERTA_URL</code> no servidor do Hub.
        </Typography>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, mb: 2 }}>
          {limitFields.map(([key, label, help]) => (
            <TextField
              key={key}
              type="number"
              label={label}
              value={limits[key] ?? ''}
              helperText={`${help} Padrão: ${config.alertasPadrao[key]}.`}
              onChange={e => setLimits({ ...limits, [key]: e.target.value })}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 1 } }}
            />
          ))}
        </Box>
        <Stack>
          {config.tiposAlerta.map(t => (
            <FormControlLabel
              key={t.id}
              control={<Checkbox checked={on[t.id] !== false} onChange={e => setOn({ ...on, [t.id]: e.target.checked })} />}
              label={t.rotulo}
            />
          ))}
        </Stack>
        <Button variant="contained" startIcon={<SaveIcon />} disabled={busy} onClick={save} sx={{ mt: 1 }}>
          Salvar
        </Button>
      </Paper>
    </Stack>
  );
}
