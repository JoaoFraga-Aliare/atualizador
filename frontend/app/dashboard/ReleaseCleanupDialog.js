'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
const fmt = value =>
  value
    ? new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z').toLocaleString('pt-BR')
    : 'Nunca instalada';
const mb = value => (Number(value || 0) / 1024 / 1024).toFixed(2);
export default function ReleaseCleanupDialog({ value, close, done }) {
  const [selected, setSelected] = useState([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setSelected(value?.candidates.map(x => x.id) || []);
    setError('');
  }, [value]);
  const toggle = id => setSelected(x => (x.includes(id) ? x.filter(v => v !== id) : [...x, id]));
  async function remove() {
    try {
      setBusy(true);
      const result = await api('/admin/release-cleanup/delete', {
        method: 'POST',
        body: JSON.stringify({ ids: selected })
      });
      done?.(`${result.deleted} versão(ões) excluída(s); ${mb(result.reclaimedBytes)} MB liberados.`);
      close();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={!!value} onClose={close} fullWidth maxWidth="lg">
      <DialogTitle>Versões sem terminais</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Typography mb={2}>
          Selecione as versões que deseja excluir. Os arquivos serão removidos, mas o histórico e os erros vinculados
          permanecerão disponíveis.
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" />
              <TableCell>Produto</TableCell>
              <TableCell>Versão</TableCell>
              <TableCell>Canal</TableCell>
              <TableCell>Última atualização</TableCell>
              <TableCell>Espaço</TableCell>
              <TableCell>Versão atual mais recente</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {value?.candidates.map(item => (
              <TableRow key={item.id}>
                <TableCell padding="checkbox">
                  <Checkbox checked={selected.includes(item.id)} onChange={() => toggle(item.id)} />
                </TableCell>
                <TableCell>{item.product_name}</TableCell>
                <TableCell>{item.version}</TableCell>
                <TableCell>{item.channel}</TableCell>
                <TableCell>{fmt(item.last_update_at)}</TableCell>
                <TableCell>{mb(item.reclaim_bytes)} MB</TableCell>
                <TableCell>{item.latest_version}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancelar</Button>
        <Button color="error" variant="contained" disabled={!selected.length || busy} onClick={remove}>
          Excluir selecionadas
        </Button>
      </DialogActions>
    </Dialog>
  );
}
