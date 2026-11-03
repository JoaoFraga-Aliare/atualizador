'use client';

import { useActionState } from 'react';
import { Alert, Box, Button, IconButton, TextField, Tooltip, Typography } from '@mui/material';
import { ContentCopy as ContentCopyIcon } from '@mui/icons-material';
import type { Estado } from '@/app/tenants/actions';

// Mensagens de uma server action: erro, sucesso e segredo mostrado uma vez (token).
export function Resultado({ estado }: { estado: Estado }) {
  if (!estado.erro && !estado.ok && !estado.codigo) return null;
  return (
    <Box sx={{ flexBasis: '100%', display: 'grid', gap: 1 }}>
      {estado.erro && <Alert severity="error">{estado.erro}</Alert>}
      {estado.ok && <Alert severity="success">{estado.ok}</Alert>}
      {estado.codigo && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, border: '1px dashed #98a2b3', borderRadius: 2, bgcolor: '#f9fafb' }}>
          <Typography component="code" sx={{ flex: 1, wordBreak: 'break-all', userSelect: 'all', fontWeight: 700 }}>{estado.codigo}</Typography>
          <Tooltip title="Copiar">
            <IconButton onClick={() => navigator.clipboard?.writeText(estado.codigo!)}><ContentCopyIcon fontSize="small" /></IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>
  );
}

type Campo = { name: string; label: string; type?: string; required?: boolean; placeholder?: string };

export function Formulario({ acao, campos, botao }: {
  acao: (e: Estado, d: FormData) => Promise<Estado>;
  campos: Campo[];
  botao: string;
}) {
  const [estado, enviar, pendente] = useActionState<Estado, FormData>(acao, {});
  return (
    <Box component="form" action={enviar} sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-start' }}>
      {campos.map((c) => (
        <TextField key={c.name} name={c.name} label={c.label} type={c.type ?? 'text'} required={c.required}
          placeholder={c.placeholder} slotProps={{ inputLabel: { shrink: true } }} sx={{ minWidth: 240, flex: '1 1 240px' }} />
      ))}
      <Button type="submit" variant="contained" disabled={pendente} sx={{ mt: 0 }}>{pendente ? 'Enviando…' : botao}</Button>
      <Resultado estado={estado} />
    </Box>
  );
}

export function BotaoAcao({ acao, rotulo }: { acao: (e: Estado) => Promise<Estado>; rotulo: string }) {
  const [estado, enviar, pendente] = useActionState<Estado, FormData>(async (e) => acao(e), {});
  return (
    <Box component="form" action={enviar}>
      <Button type="submit" size="small" variant="outlined" disabled={pendente}>{rotulo}</Button>
      <Resultado estado={estado} />
    </Box>
  );
}
