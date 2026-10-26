'use client';
import { useEffect, useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { api } from '../../lib/api';
import ApiTokens from './ApiTokens';
export default function ProfileTokenDialog({ open, close }) {
  const [products, setProducts] = useState([]);
  useEffect(() => {
    if (open)
      api('/admin/products')
        .then(setProducts)
        .catch(() => setProducts([]));
  }, [open]);
  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="lg">
      <DialogTitle>Administração de tokens CI/CD</DialogTitle>
      <DialogContent>
        <ApiTokens products={products} />
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Fechar</Button>
      </DialogActions>
    </Dialog>
  );
}
