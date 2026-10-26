'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { Grid } from './components';
import { fmt } from './format';

export default function LogDialog({ value, close }) {
  const [status, setStatus] = useState(''),
    [startDate, setStartDate] = useState(''),
    [endDate, setEndDate] = useState('');
  useEffect(() => {
    setStatus('');
    setStartDate('');
    setEndDate('');
  }, [value?.terminal.id]);
  const statuses = useMemo(
      () => [...new Set((value?.items || []).map(x => x.status))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
      [value?.items]
    ),
    filtered = useMemo(() => {
      const start = startDate ? new Date(`${startDate}T00:00:00`) : null,
        end = endDate ? new Date(`${endDate}T23:59:59.999`) : null;
      return (value?.items || []).filter(x => {
        const created = new Date(x.created_at.includes('T') ? x.created_at : x.created_at.replace(' ', 'T') + 'Z');
        return (!status || x.status === status) && (!start || created >= start) && (!end || created <= end);
      });
    }, [value?.items, status, startDate, endDate]),
    clear = () => {
      setStatus('');
      setStartDate('');
      setEndDate('');
    };
  return (
    <Dialog open={!!value} fullWidth maxWidth="lg" onClose={close}>
      <DialogTitle>Log do terminal {value?.terminal.name}</DialogTitle>
      <DialogContent>
        {value && (
          <Stack spacing={2} mt={1}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
              <FormControl sx={{ minWidth: 200 }}>
                <InputLabel>Status</InputLabel>
                <Select label="Status" value={status} onChange={e => setStatus(e.target.value)}>
                  <MenuItem value="">Todos</MenuItem>
                  {statuses.map(item => (
                    <MenuItem key={item} value={item}>
                      {item}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                type="date"
                label="Data inicial"
                InputLabelProps={{ shrink: true }}
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                inputProps={{ max: endDate || undefined }}
              />
              <TextField
                type="date"
                label="Data final"
                InputLabelProps={{ shrink: true }}
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                inputProps={{ min: startDate || undefined }}
              />
              <Button onClick={clear} disabled={!status && !startDate && !endDate}>
                Limpar filtros
              </Button>
              <Box flex={1} />
              <Typography variant="body2" color="text.secondary">
                {filtered.length} de {value.items.length} evento(s)
              </Typography>
            </Stack>
            <Grid
              heads={['Data', 'Status', 'Versão anterior', 'Versão destino', 'IP', 'Mensagem']}
              rows={filtered.map(x => [
                fmt(x.created_at),
                x.status,
                x.previous_version || '-',
                x.target_version || '-',
                x.ip || '-',
                x.message || '-'
              ])}
            />
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Fechar</Button>
      </DialogActions>
    </Dialog>
  );
}
