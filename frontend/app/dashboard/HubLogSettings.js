'use client';
import { useCallback, useEffect, useState } from 'react';
import { Box, Button, Checkbox, FormControlLabel, Paper, Stack, TextField, Typography } from '@mui/material';
import {
  DeleteForever as DeleteForeverIcon,
  DeleteSweep as DeleteSweepIcon,
  CleaningServices as CleaningServicesIcon,
  Save as SaveIcon,
  TextSnippet as TextSnippetIcon
} from '@mui/icons-material';
import { api } from '../../lib/api';
import { Notice, when } from './HubUi';

const explain = e => (e.message === 'hub_not_configured' ? 'O Hub não está configurado no servidor.' : e.message);

function Section({ title, text, children }) {
  return (
    <Paper sx={{ p: { xs: 2, md: 3 } }}>
      <Typography variant="h6">{title}</Typography>
      {text && (
        <Typography variant="body2" color="text.secondary" mb={2}>
          {text}
        </Typography>
      )}
      {children}
    </Paper>
  );
}

// Hub > Logs (administrador): quanto tempo o log de requisicoes fica guardado, limpeza manual e
// quais erros geram notificacao (sino do painel).
export default function HubLogSettings() {
  const [config, setConfig] = useState(null),
    [days, setDays] = useState(''),
    [hours, setHours] = useState(''),
    [notify, setNotify] = useState({}),
    [retention, setRetention] = useState({}),
    [olderThan, setOlderThan] = useState('30'),
    [notice, setNotice] = useState(null),
    [busy, setBusy] = useState(false),
    apply = useCallback(c => {
      setConfig(c);
      setDays(c.personalizado.diasLog ? String(c.diasLog) : '');
      setHours(c.personalizado.horasCorpo ? String(c.horasCorpo) : '');
      setNotify(c.notificar);
      setRetention(c.retencao);
    }, []),
    load = useCallback(async () => {
      try {
        apply(await api('/admin/hub/logs/config'));
      } catch (e) {
        setNotice({ error: explain(e) });
      }
    }, [apply]);
  useEffect(() => {
    load();
  }, [load]);

  async function run(fn, ok) {
    setBusy(true);
    try {
      setNotice({ ok: await fn() });
      await load();
    } catch (e) {
      setNotice({ error: explain(e) });
    }
    setBusy(false);
    return ok;
  }
  const number = text => (text.trim() === '' ? null : Number(text));
  const saveRetention = () =>
    run(async () => {
      apply(
        await api('/admin/hub/logs/config', {
          method: 'PUT',
          body: JSON.stringify({ diasLog: number(days), horasCorpo: number(hours) })
        })
      );
      return 'Retenção salva. Vale para os próximos registros e para a limpeza automática (a cada 10 min).';
    });
  const saveRetentionData = () =>
    run(async () => {
      apply(
        await api('/admin/hub/logs/config', {
          method: 'PUT',
          body: JSON.stringify({ retencao: Object.fromEntries(Object.entries(retention).map(([k, v]) => [k, Number(v)])) })
        })
      );
      return 'Prazos salvos. A limpeza roda sozinha a cada hora.';
    });
  const saveNotify = () =>
    run(async () => {
      apply(await api('/admin/hub/logs/config', { method: 'PUT', body: JSON.stringify({ notificar: notify }) }));
      return 'Notificações salvas. Os erros das últimas 24 h aparecem no sino do painel.';
    });
  const clear = (body, confirm, label) => {
    if (!window.confirm(confirm)) return;
    run(async () => {
      const r = await api('/admin/hub/logs/clear', { method: 'POST', body: JSON.stringify(body) });
      return r.corposLimpos ? `${label}: ${r.corposLimpos} registro(s) sem conteúdo.` : `${label}: ${r.removidas} registro(s) apagado(s).`;
    });
  };

  if (!config) return <Stack spacing={2}>{notice ? <Notice value={notice} /> : <Typography>Carregando…</Typography>}</Stack>;
  const { totais, padrao } = config;
  return (
    <Stack spacing={3}>
      <Notice value={notice} close={() => setNotice(null)} />

      <Section
        title="Situação do log"
        text="Registro de tudo que o PDV, o Agrosys e os sistemas dos clientes pedem ao Hub (tela Log de cada cliente)."
      >
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
          {[
            ['Requisições guardadas', totais.linhas],
            ['Com conteúdo (enviado/recebido)', totais.comCorpo],
            ['Mais antiga', when(totais.maisAntiga)],
            ['Espaço no banco', `${totais.mb} MB`]
          ].map(([label, value]) => (
            <Box key={label} sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="body2" color="text.secondary">
                {label}
              </Typography>
              <Typography variant="h6">{value}</Typography>
            </Box>
          ))}
        </Box>
      </Section>

      <Section
        title="Tempo de armazenamento"
        text="Passado o prazo, o Hub apaga sozinho. Deixe em branco para usar o padrão do servidor."
      >
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'flex-start' }}>
          <TextField
            label="Guardar as requisições por (dias)"
            type="number"
            value={days}
            onChange={e => setDays(e.target.value)}
            placeholder={`padrão: ${padrao.diasLog}`}
            helperText="Rota, status, tempo e resultado. De 1 a 3650."
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 1, max: 3650 } }}
            sx={{ flex: 1 }}
          />
          <TextField
            label="Guardar o conteúdo enviado/recebido por (horas)"
            type="number"
            value={hours}
            onChange={e => setHours(e.target.value)}
            placeholder={`padrão: ${padrao.horasCorpo}`}
            helperText="Corpos podem ter dados do cliente; quanto menor, melhor. De 1 a 720."
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 1, max: 720 } }}
            sx={{ flex: 1 }}
          />
          <Button variant="contained" startIcon={<SaveIcon />} disabled={busy} onClick={saveRetention} sx={{ mt: 1 }}>
            Salvar
          </Button>
        </Stack>
      </Section>

      <Section
        title="Retenção de dados"
        text="O cadastro (produtos, clientes, preços…) guarda só a versão mais recente de cada registro. Estes prazos limitam o que acumula histórico: passado o prazo, o Hub apaga sozinho."
      >
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, mb: 1 }}>
          {[
            ['enviosDias', 'Envios já entregues (dias)', 'Notas, caixa e e-mails que o destino já recebeu. O conteúdo da nota sai em 3 dias; a linha, neste prazo.'],
            ['entregasDias', 'Entregas de webhook (dias)', 'As que falharam ficam o dobro.'],
            ['execucoesDias', 'Histórico de sincronizações (dias)', 'Execuções da carga com o Agrosys.'],
            ['alertasDias', 'Alertas resolvidos (dias)', 'Os abertos nunca são apagados.'],
            ['exclusoesDias', 'Registros removidos (dias)', 'O terminal precisa ler a remoção uma vez; terminal parado há mais que isso refaz a carga.']
          ].map(([key, label, help]) => (
            <TextField
              key={key}
              type="number"
              label={label}
              value={retention[key] ?? ''}
              helperText={`${help} Padrão: ${config.retencaoPadrao[key]}.`}
              onChange={e => setRetention({ ...retention, [key]: e.target.value })}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 1 } }}
            />
          ))}
        </Box>
        <Stack direction="row" gap={1.5} flexWrap="wrap">
          <Button variant="contained" startIcon={<SaveIcon />} disabled={busy} onClick={saveRetentionData}>
            Salvar
          </Button>
          <Button
            variant="outlined"
            startIcon={<CleaningServicesIcon />}
            disabled={busy}
            onClick={() => clear({ alvo: 'retencao' }, 'Aplicar os prazos agora e apagar o que passou deles?', 'Dados antigos apagados')}
          >
            Limpar agora
          </Button>
        </Stack>
      </Section>

      <Section
        title="Erros que geram notificação"
        text="Os erros das últimas 24 h dessas categorias aparecem no sino do painel, agrupados por cliente e rota."
      >
        <Stack>
          {config.categorias.map(c => (
            <FormControlLabel
              key={c.id}
              control={
                <Checkbox checked={notify[c.id] === true} onChange={e => setNotify({ ...notify, [c.id]: e.target.checked })} />
              }
              label={c.rotulo}
            />
          ))}
        </Stack>
        <Button variant="contained" startIcon={<SaveIcon />} disabled={busy} onClick={saveNotify} sx={{ mt: 1 }}>
          Salvar
        </Button>
      </Section>

      <Section title="Limpar agora" text="Apaga na hora, sem esperar o prazo. Não dá para desfazer.">
        <Stack direction="row" gap={1.5} flexWrap="wrap" alignItems="center">
          <Button
            variant="outlined"
            startIcon={<TextSnippetIcon />}
            disabled={busy}
            onClick={() =>
              clear(
                { alvo: 'corpos' },
                'Apagar o conteúdo enviado/recebido de todas as requisições? As linhas do log continuam.',
                'Conteúdo apagado'
              )
            }
          >
            Apagar conteúdo
          </Button>
          <Button
            variant="outlined"
            startIcon={<CleaningServicesIcon />}
            disabled={busy}
            onClick={() =>
              clear(
                { alvo: 'sucesso' },
                'Apagar todas as requisições que deram certo? Só ficam as recusadas e com erro.',
                'Requisições com sucesso apagadas'
              )
            }
          >
            Apagar as que deram certo
          </Button>
          <Stack direction="row" gap={1} alignItems="center">
            <TextField
              size="small"
              type="number"
              label="mais antigas que (dias)"
              value={olderThan}
              onChange={e => setOlderThan(e.target.value)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 1 } }}
              sx={{ width: 190 }}
            />
            <Button
              variant="outlined"
              startIcon={<DeleteSweepIcon />}
              disabled={busy || !Number(olderThan)}
              onClick={() =>
                clear(
                  { alvo: 'antigos', dias: Number(olderThan) },
                  `Apagar as requisições com mais de ${olderThan} dia(s)?`,
                  'Requisições antigas apagadas'
                )
              }
            >
              Apagar antigas
            </Button>
          </Stack>
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteForeverIcon />}
            disabled={busy}
            onClick={() =>
              clear({ alvo: 'tudo' }, 'Apagar TODO o log de requisições do Hub? Esta ação não pode ser desfeita.', 'Log apagado')
            }
          >
            Apagar tudo
          </Button>
        </Stack>
      </Section>
    </Stack>
  );
}
