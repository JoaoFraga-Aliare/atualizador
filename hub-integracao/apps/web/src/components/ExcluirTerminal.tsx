'use client';

import { useState, useTransition } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, Tooltip,
} from '@mui/material';
import { DeleteOutline as DeleteOutlineIcon } from '@mui/icons-material';
import type { Estado } from '@/app/tenants/actions';

// Excluir terminal com confirmação: o token deixa de funcionar e os parâmetros do
// caixa configurados no Hub são apagados. Os dados sincronizados da empresa ficam.
export function ExcluirTerminal({ nome, acao }: { nome: string; acao: () => Promise<Estado> }) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState('');
  const [pendente, iniciar] = useTransition();

  const confirmar = () => iniciar(async () => {
    const r = await acao();
    if (r.erro) setErro(r.erro); else setAberto(false);
  });

  return (
    <>
      <Tooltip title="Excluir terminal">
        <IconButton color="error" aria-label={`Excluir ${nome}`} onClick={() => { setErro(''); setAberto(true); }}>
          <DeleteOutlineIcon />
        </IconButton>
      </Tooltip>
      <Dialog open={aberto} onClose={() => !pendente && setAberto(false)} fullWidth maxWidth="xs">
        <DialogTitle>Excluir terminal</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: erro ? 2 : 0 }}>
            Excluir <strong>{nome}</strong>? O token deixa de funcionar na hora e os parâmetros configurados para este caixa
            serão apagados. Os dados sincronizados da empresa não são afetados. Esta ação não pode ser desfeita.
          </DialogContentText>
          {erro && <Alert severity="error">{erro}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAberto(false)} disabled={pendente}>Cancelar</Button>
          <Button variant="contained" color="error" onClick={confirmar} disabled={pendente}>
            {pendente ? 'Excluindo…' : 'Excluir'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
