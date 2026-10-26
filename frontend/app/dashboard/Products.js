'use client';
import { useState } from 'react';
import { Box, Button, Stack, TextField } from '@mui/material';
import ProductThemeDialog from './ProductThemeDialog';
import { BackHome, ConfirmDialog, Grid } from './components';
import { api } from '../../lib/api';

export default function Products({ items, admin, done }) {
  const [code, setCode] = useState(''),
    [name, setName] = useState(''),
    [confirm, setConfirm] = useState(null),
    [customizing, setCustomizing] = useState(null);
  async function add() {
    try {
      await api('/admin/products', { method: 'POST', body: JSON.stringify({ code, name }) });
      setCode('');
      setName('');
      done('Produto cadastrado');
    } catch (e) {
      done(e.message);
    }
  }
  async function remove(p) {
    try {
      const impact = await api(`/admin/products/${p.id}/delete-impact`);
      setConfirm({
        title: 'Excluir produto',
        danger: true,
        allowYes: impact.canDelete,
        message: impact.canDelete
          ? `Excluir o produto ${p.name}?`
          : `Não é possível excluir. Existem ${impact.releases} versão(ões) e ${impact.terminals} terminal(is) vinculados.`,
        onYes: async () => {
          await api(`/admin/products/${p.id}`, { method: 'DELETE' });
          done('Produto excluído');
        }
      });
    } catch (e) {
      done(e.message);
    }
  }
  return (
    <>
      <Stack spacing={2}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <BackHome />
        </Box>
        {admin && (
          <Stack direction="row" spacing={1}>
            <TextField size="small" label="Código" value={code} onChange={e => setCode(e.target.value)} />
            <TextField size="small" label="Nome" value={name} onChange={e => setName(e.target.value)} />
            <Button variant="contained" disabled={!code || !name} onClick={add}>
              Cadastrar
            </Button>
          </Stack>
        )}
        <Grid
          heads={['Produto', 'Código', 'Ações']}
          rows={items.map(p => [
            p.name,
            p.code,
            admin ? (
              <Stack key={p.id} direction="row">
                <Button onClick={() => setCustomizing(p)}>Personalizar</Button>
                <Button color="error" onClick={() => remove(p)}>
                  Excluir
                </Button>
              </Stack>
            ) : (
              '-'
            )
          ])}
        />
      </Stack>
      <ConfirmDialog value={confirm} close={() => setConfirm(null)} />
      <ProductThemeDialog product={customizing} close={() => setCustomizing(null)} done={done} />
    </>
  );
}
