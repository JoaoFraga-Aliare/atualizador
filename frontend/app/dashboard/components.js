'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip as MuiChip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Stack,
  TablePagination,
  Tooltip,
  Typography
} from '@mui/material';
import { Add as AddIcon, Home as HomeIcon } from '@mui/icons-material';
import { allowedChannels, channelColors } from './format';

// Chip com a cor do canal quando o rotulo e test, beta ou production.
export function Chip(props) {
  const color = channelColors[props.label];
  return <MuiChip {...props} sx={{ ...(color ? { bgcolor: color, color: '#fff' } : {}), ...props.sx }} />;
}

export function PublishButton({ onClick }) {
  return (
    <Tooltip title="Publicar versão">
      <span>
        <IconButton color="primary" onClick={onClick}>
          <AddIcon />
        </IconButton>
      </span>
    </Tooltip>
  );
}

export function BackHome() {
  return (
    <Tooltip title="Voltar à página inicial">
      <IconButton
        color="primary"
        onClick={() => {
          location.href = '/dashboard';
        }}
      >
        <HomeIcon />
      </IconButton>
    </Tooltip>
  );
}

export function Item({ icon, text, click, color }) {
  return (
    <MenuItem onClick={click} sx={{ color }}>
      <ListItemIcon>{icon}</ListItemIcon>
      <ListItemText>{text}</ListItemText>
    </MenuItem>
  );
}

export function ConfirmDialog({ value, close }) {
  async function yes() {
    try {
      await value.onYes?.();
      close();
    } catch (e) {
      close();
      alert(e.message);
    }
  }
  return (
    <Dialog open={!!value} onClose={close} fullWidth maxWidth="xs">
      <DialogTitle>{value?.title || 'Confirmação'}</DialogTitle>
      <DialogContent>
        <Typography sx={{ whiteSpace: 'pre-wrap' }}>{value?.message}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancelar</Button>
        <Button onClick={close}>Não</Button>
        <Button
          variant="contained"
          color={value?.danger ? 'error' : 'primary'}
          disabled={value?.allowYes === false}
          onClick={yes}
        >
          Sim
        </Button>
      </DialogActions>
    </Dialog>
  );
}

const STATS = [
  { key: 'clients', label: 'Clientes' },
  { key: 'terminals', label: 'Terminais' },
  { key: 'releases', label: 'Versões ativas' },
  { key: 'errors', label: 'Erros em 7 dias' }
];

// Cartoes do topo; os botoes de canal ficam sobre o de erros e filtram os quatro.
export function StatsCards({ stats, selectedChannels, toggleChannel }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4,1fr)' }, gap: 2 }}>
      {STATS.map(({ key, label }) => {
        const card = (
          <Paper sx={{ p: 2.5, height: '100%', boxSizing: 'border-box' }}>
            <Typography color="text.secondary">{label}</Typography>
            <Typography variant="h4">{stats?.[key] || 0}</Typography>
          </Paper>
        );
        if (key !== 'errors') return <Box key={key}>{card}</Box>;
        return (
          <Box key={key} sx={{ position: 'relative' }}>
            <Stack direction="row" spacing={0.35} sx={{ position: 'absolute', right: 0, top: -22 }}>
              {allowedChannels()
                .slice()
                .reverse()
                .map(channel => {
                  const selected = selectedChannels.includes(channel),
                    color = channelColors[channel];
                  return (
                    <Button
                      key={channel}
                      size="small"
                      onClick={() => toggleChannel(channel)}
                      aria-pressed={selected}
                      sx={{
                        minWidth: 0,
                        minHeight: 18,
                        px: 0.8,
                        py: 0,
                        fontSize: 9,
                        lineHeight: 1,
                        textTransform: 'none',
                        borderRadius: 1,
                        color: selected ? '#fff' : color,
                        bgcolor: selected ? color : `${color}22`,
                        border: `1px solid ${color}55`,
                        '&:hover': { bgcolor: selected ? color : `${color}38` }
                      }}
                    >
                      {channel === 'production' ? 'Produção' : channel === 'beta' ? 'Beta' : 'Test'}
                    </Button>
                  );
                })}
            </Stack>
            {card}
          </Box>
        );
      })}
    </Box>
  );
}

export function Grid({ heads, rows, showHome = false }) {
  const [page, setPage] = useState(0),
    [size, setSize] = useState(10),
    [order, setOrder] = useState({ index: 0, direction: 'asc' });
  useEffect(() => setPage(0), [rows.length]);
  const sorted = useMemo(() => {
    const text = value => {
      if (value === null || value === undefined) return '';
      if (typeof value === 'string' || typeof value === 'number') return String(value);
      return String(value?.props?.children ?? value?.props?.label ?? '');
    };
    return rows
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const result = text(a.row[order.index]).localeCompare(text(b.row[order.index]), 'pt-BR', {
          numeric: true,
          sensitivity: 'base'
        });
        return (order.direction === 'asc' ? result : -result) || a.index - b.index;
      })
      .map(x => x.row);
  }, [rows, order]);
  function sort(index) {
    setOrder(current => ({
      index,
      direction: current.index === index && current.direction === 'asc' ? 'desc' : 'asc'
    }));
    setPage(0);
  }
  return (
    <>
      {showHome && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
          <BackHome />
        </Box>
      )}
      <Box sx={{ overflowX: 'auto' }}>
        <Box sx={{ minWidth: heads.length * 140 }}>
          <Box
            sx={{ display: 'grid', gridTemplateColumns: `repeat(${heads.length},1fr)`, gap: 2, p: 1, fontWeight: 700 }}
          >
            {heads.map((x, i) => (
              <Button
                key={x}
                color="inherit"
                onClick={() => sort(i)}
                sx={{ justifyContent: 'flex-start', fontWeight: 700, textTransform: 'none', p: 0 }}
              >
                {x}
                {order.index === i ? (order.direction === 'asc' ? ' ▲' : ' ▼') : ''}
              </Button>
            ))}
          </Box>
          {sorted.slice(page * size, page * size + size).map((row, i) => (
            <Box
              key={i}
              sx={{
                display: 'grid',
                gridTemplateColumns: `repeat(${heads.length},1fr)`,
                gap: 2,
                p: 1.5,
                borderTop: '1px solid',
                borderColor: 'divider',
                alignItems: 'center'
              }}
            >
              {row.map((x, j) => (
                <Box key={j}>{x}</Box>
              ))}
            </Box>
          ))}
        </Box>
      </Box>
      <TablePagination
        component="div"
        count={rows.length}
        page={Math.min(page, Math.max(Math.ceil(rows.length / size) - 1, 0))}
        onPageChange={(_, p) => setPage(p)}
        rowsPerPage={size}
        onRowsPerPageChange={e => {
          setSize(+e.target.value);
          setPage(0);
        }}
        rowsPerPageOptions={[5, 10, 25, 50]}
        labelRowsPerPage="Itens por página"
        labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
      />
    </>
  );
}
