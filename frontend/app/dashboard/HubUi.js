'use client';
import { useState } from 'react';
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
import { ContentCopy as ContentCopyIcon } from '@mui/icons-material';
import { api } from '../../lib/api';

// Chamadas ao Hub passam pelo painel: o servidor confere o usuario e a empresa antes de repassar.
export const hubApi = (path, options) => api(`/admin/hub/proxy${path}`, options);
export const hubSend = (path, method, body) => hubApi(path, { method, body: JSON.stringify(body ?? {}) });

export const when = value => (value ? new Date(value).toLocaleString('pt-BR') : '—');

const errors = {
  hub_not_configured: 'O Hub não está configurado no servidor (HUB_API_URL e HUB_SERVICE_KEY).',
  hub_unreachable: 'Não foi possível falar com a API do Hub.',
  homologation_required: 'Você ainda não foi homologado para cadastrar clientes.',
  tenant_forbidden: 'Sem acesso a este cliente.'
};
export const hubError = e => ({ error: errors[e.message] || e.message });

// Acao so com icone e dica (tooltip). O span deixa a dica funcionar tambem com o botao desabilitado.
export function IconAction({ title, icon: Icon, onClick, color = 'primary', disabled, type = 'button', sx }) {
  return (
    <Tooltip title={title}>
      <span>
        <IconButton aria-label={title} color={color} disabled={disabled} type={type} onClick={onClick} sx={sx}>
          <Icon fontSize="small" />
        </IconButton>
      </span>
    </Tooltip>
  );
}

// Mensagem de uma acao: erro, sucesso e segredo mostrado uma vez (token ou chave).
export function Notice({ value, close }) {
  if (!value || (!value.error && !value.ok && !value.secret)) return null;
  return (
    <Stack spacing={1}>
      {value.error && (
        <Alert severity="error" onClose={close}>
          {value.error}
        </Alert>
      )}
      {value.ok && (
        <Alert severity="success" onClose={close}>
          {value.ok}
        </Alert>
      )}
      {value.secret && (
        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, border: '1px dashed #98a2b3', borderRadius: 2 }}
        >
          <Typography component="code" sx={{ flex: 1, wordBreak: 'break-all', userSelect: 'all', fontWeight: 700 }}>
            {value.secret}
          </Typography>
          <Tooltip title="Copiar">
            <IconButton onClick={() => navigator.clipboard?.writeText(value.secret)}>
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Stack>
  );
}

// Segredo mostrado uma unica vez (token do terminal, chave de API): em janela, para nao ficar fora da tela.
export function SecretDialog({ value, close }) {
  const [copied, setCopied] = useState(false);
  if (!value?.secret) return null;
  return (
    <Dialog open onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>Copie agora</DialogTitle>
      <DialogContent>
        <Typography sx={{ mb: 2 }}>{value.ok || 'Este valor aparece só agora.'}</Typography>
        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, border: '1px dashed #98a2b3', borderRadius: 2 }}
        >
          <Typography component="code" sx={{ flex: 1, wordBreak: 'break-all', userSelect: 'all', fontWeight: 700 }}>
            {value.secret}
          </Typography>
          <Tooltip title={copied ? 'Copiado' : 'Copiar'}>
            <IconButton
              onClick={() => {
                navigator.clipboard?.writeText(value.secret);
                setCopied(true);
              }}
            >
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={close}>
          Já copiei
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// Formulario simples: campos [{ name, label, type, required, placeholder }]; run(values) devolve o aviso.
export function ActionForm({ fields, button, run, icon: Icon }) {
  const [values, setValues] = useState({}),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const result = await run(values);
    setBusy(false);
    if (result && !result.error) setValues({});
  }
  return (
    <Box
      component="form"
      onSubmit={submit}
      sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-start' }}
    >
      {fields.map(f => (
        <TextField
          key={f.name}
          select={Boolean(f.options)}
          label={f.label}
          type={f.type || 'text'}
          required={f.required}
          placeholder={f.placeholder}
          disabled={f.disabled}
          helperText={f.helperText}
          value={values[f.name] ?? f.default ?? ''}
          onChange={e => setValues({ ...values, [f.name]: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ minWidth: 240, flex: '1 1 240px' }}
        >
          {f.options?.map(([value, label]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </TextField>
      ))}
      <Button type="submit" variant="contained" disabled={busy} startIcon={Icon ? <Icon /> : undefined}>
        {busy ? 'Enviando…' : button}
      </Button>
    </Box>
  );
}

// Acao pontual; com `confirm` pede confirmacao antes. Com `icon` vira so o icone (o label vira a dica).
export function ActionButton({ label, run, confirm, color, variant = 'outlined', icon: Icon }) {
  const [busy, setBusy] = useState(false);
  const click = async () => {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    await run();
    setBusy(false);
  };
  if (Icon) return <IconAction title={label} icon={Icon} color={color ?? 'primary'} disabled={busy} onClick={click} />;
  return (
    <Button size="small" color={color} variant={variant} disabled={busy} onClick={click}>
      {label}
    </Button>
  );
}
