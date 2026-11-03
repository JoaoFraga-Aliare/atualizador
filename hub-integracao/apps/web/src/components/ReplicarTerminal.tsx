'use client';

import { useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, Tooltip } from '@mui/material';
import { ContentCopy as ContentCopyIcon } from '@mui/icons-material';
import type { Estado } from '@/app/tenants/actions';
import { Formulario } from '@/components/Formulario';

// Replica um terminal: novo nome e código, mesmos parâmetros do caixa, token próprio.
export function ReplicarTerminal({ nome, acao }: { nome: string; acao: (e: Estado, d: FormData) => Promise<Estado> }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Tooltip title="Replicar terminal">
        <IconButton color="primary" aria-label={`Replicar ${nome}`} onClick={() => setAberto(true)}><ContentCopyIcon /></IconButton>
      </Tooltip>
      <Dialog open={aberto} onClose={() => setAberto(false)} fullWidth maxWidth="sm">
        <DialogTitle>Replicar terminal</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Cria um terminal novo com os mesmos parâmetros de <strong>{nome}</strong>. Informe o nome e o código do novo caixa.
          </DialogContentText>
          <Formulario acao={acao} botao="Replicar" campos={[
            { name: 'nome', label: 'Nome do novo caixa', required: true, placeholder: 'Caixa 02' },
            { name: 'codigoLegado', label: 'Código no PDV (cai_codigo)' },
          ]} />
        </DialogContent>
        <DialogActions><Button onClick={() => setAberto(false)}>Fechar</Button></DialogActions>
      </Dialog>
    </>
  );
}
