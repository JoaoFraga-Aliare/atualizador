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
  DialogContentText,
  DialogTitle,
  Stack,
  Typography
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  HowToReg as HowToRegIcon,
  Refresh as RefreshIcon,
  RadioButtonUnchecked as RadioButtonUncheckedIcon
} from '@mui/icons-material';
import { api } from '../../lib/api';

const messages = {
  hub_not_configured: 'O Hub não está configurado no servidor (HUB_API_URL e HUB_SERVICE_KEY).',
  hub_unreachable: 'Não foi possível falar com a API do Hub.',
  no_homologation_client: 'Este player não tem cliente de homologação.'
};
const explain = e => messages[e.message] || e.message;

function Row({ item }) {
  const Icon = item.ok ? CheckCircleIcon : item.obrigatorio ? CancelIcon : RadioButtonUncheckedIcon,
    color = item.ok ? 'success.main' : item.obrigatorio ? 'error.main' : 'text.disabled';
  return (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', py: 0.75 }}>
      <Icon sx={{ color, mt: 0.25 }} fontSize="small" aria-label={item.ok ? 'tem' : 'falta'} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="body2" fontWeight={600}>
            {item.titulo}
          </Typography>
          {!item.obrigatorio && <Chip size="small" variant="outlined" label="recomendado" />}
          {item.semApi && !item.ok && <Chip size="small" color="warning" variant="outlined" label="ainda sem API" />}
        </Box>
        <Typography variant="caption" color="text.secondary" display="block">
          {item.descricao}
        </Typography>
        <Typography variant="caption" sx={{ color: item.ok ? 'success.main' : 'text.secondary' }} display="block">
          {item.detalhe}
        </Typography>
      </Box>
    </Box>
  );
}

// Homologar: mostra o que o PDV exige para vender e o que o cliente de homologacao ja tem (check).
// Liberar com obrigatorios faltando pede confirmacao.
export default function HubHomologation({ user, close, done }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(''),
    [confirming, setConfirming] = useState(false),
    [busy, setBusy] = useState(false),
    load = useCallback(async () => {
      setData(null);
      setError('');
      try {
        setData(await api(`/admin/hub/users/${user.id}/readiness`));
      } catch (e) {
        setError(explain(e));
      }
    }, [user.id]);
  useEffect(() => {
    load();
  }, [load]);

  async function release(force) {
    setBusy(true);
    try {
      await api(`/admin/hub/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ homologated: true, force }) });
      done(force && data.faltam ? `Player homologado com ${data.faltam} pendência(s)` : 'Player homologado');
    } catch (e) {
      setConfirming(false);
      setBusy(false);
      if (e.message === 'homologation_incomplete') {
        setError('Os dados do cliente mudaram: confira o checklist novamente.');
        load();
      } else setError(explain(e));
    }
  }

  const groups = data ? [...new Set(data.itens.map(i => i.grupo))] : [],
    missing = data ? data.itens.filter(i => i.obrigatorio && !i.ok) : [];
  return (
    <>
      <Dialog open onClose={busy ? undefined : close} fullWidth maxWidth="md">
        <DialogTitle>Homologar {user.name}</DialogTitle>
        <DialogContent dividers>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {!data && !error && (
            <Box sx={{ display: 'grid', placeItems: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          )}
          {data && (
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                Dados que o PDV exige para emitir uma venda, conferidos no cliente de homologação{' '}
                {user.company ? `(${user.company})` : ''}. O que está marcado já existe no Hub.
              </Typography>
              {missing.length ? (
                <Alert severity="warning">
                  Faltam {data.faltam} de {data.obrigatorios} itens obrigatórios.
                </Alert>
              ) : (
                <Alert severity="success">Tudo que o PDV exige já está no Hub.</Alert>
              )}
              {groups.map(g => (
                <Box key={g}>
                  <Typography variant="overline" color="text.secondary">
                    {g}
                  </Typography>
                  {data.itens
                    .filter(i => i.grupo === g)
                    .map(i => (
                      <Row key={i.id} item={i} />
                    ))}
                </Box>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={load} disabled={busy} startIcon={<RefreshIcon />}>
            Atualizar
          </Button>
          {data && (
            <Button
              variant="contained"
              color={missing.length ? 'warning' : 'primary'}
              disabled={busy}
              onClick={() => (missing.length ? setConfirming(true) : release(false))}
            >
              {missing.length ? 'Homologar mesmo assim…' : 'Homologar'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
      {confirming && (
        <Dialog open onClose={busy ? undefined : () => setConfirming(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Liberar sem todos os dados?</DialogTitle>
          <DialogContent>
            <DialogContentText component="div">
              Faltam {missing.length} item(ns) obrigatório(s) para o PDV vender:
              <ul style={{ margin: '8px 0' }}>
                {missing.map(i => (
                  <li key={i.id}>{i.titulo}</li>
                ))}
              </ul>
              Ao homologar, {user.name} poderá cadastrar clientes mesmo assim, e a liberação ficará registrada com{' '}
              {missing.length} pendência(s). Confirma?
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirming(false)} disabled={busy}>
              Voltar
            </Button>
            <Button
              variant="contained"
              color="warning"
              startIcon={<HowToRegIcon />}
              disabled={busy}
              onClick={() => release(true)}
            >
              {busy ? 'Homologando…' : 'Sim, homologar'}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
