'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import {
  Alert,
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
  Switch,
  FormControlLabel,
  TextField,
  Typography
} from '@mui/material';

const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const empty = {
  theme: 'agrosys',
  name: 'Padrão',
  isDefault: true,
  priority: 0,
  startDate: '',
  endDate: '',
  weekdays: [],
  specificDates: '',
  fontFamily: '',
  borderColor: '#9e9e9e',
  fontColor: '#212121',
  errorColor: '#d32f2f',
  gridSelectionColor: '#1976d2',
  gridSelectionFontColor: '#ffffff',
  logoWidth: 191,
  logoHeight: 35
};

export default function ProductThemeDialog({ product, close, done }) {
  const [items, setItems] = useState([]),
    [form, setForm] = useState(empty),
    [logo, setLogo] = useState(null),
    [background, setBackground] = useState(null),
    [startImages, setStartImages] = useState([]),
    [error, setError] = useState('');
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  async function load() {
    if (product)
      try {
        setItems(await api(`/admin/products/${product.id}/themes`));
      } catch (e) {
        setError(e.message);
      }
  }
  useEffect(() => {
    setForm(empty);
    setError('');
    load();
  }, [product?.id]);
  async function save() {
    try {
      const body = new FormData(),
        settings =
          form.theme === 'aliare'
            ? {
                fontFamily: form.fontFamily,
                borderColor: form.borderColor,
                fontColor: form.fontColor,
                errorColor: form.errorColor,
                gridSelectionColor: form.gridSelectionColor,
                gridSelectionFontColor: form.gridSelectionFontColor,
                logoWidth: Number(form.logoWidth),
                logoHeight: Number(form.logoHeight)
              }
            : {};
      for (const [key, value] of Object.entries({
        theme: form.theme,
        name: form.name,
        isDefault: form.isDefault,
        priority: form.priority,
        startDate: form.startDate,
        endDate: form.endDate,
        weekdays: JSON.stringify(form.weekdays),
        specificDates: JSON.stringify(
          form.specificDates
            .split(',')
            .map(x => x.trim())
            .filter(Boolean)
        ),
        settings: JSON.stringify(settings)
      }))
        body.append(key, String(value));
      if (logo) body.append('logo', logo);
      if (background) body.append('background', background);
      for (const file of startImages) body.append('startImages', file);
      await api(`/admin/products/${product.id}/themes`, { method: 'POST', body });
      setForm(empty);
      setLogo(null);
      setBackground(null);
      setStartImages([]);
      await load();
      done?.('Personalização salva');
    } catch (e) {
      setError(e.message);
    }
  }
  async function remove(item) {
    if (!confirm(`Excluir a configuração ${item.name}?`)) return;
    try {
      await api(`/admin/products/${product.id}/themes/${item.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }
  const toggleDay = day =>
    set('weekdays', form.weekdays.includes(day) ? form.weekdays.filter(x => x !== day) : [...form.weekdays, day]);
  return (
    <Dialog open={!!product} onClose={close} fullWidth maxWidth="md">
      <DialogTitle>Personalização — {product?.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} mt={1}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography variant="subtitle1" fontWeight={700}>
            Nova configuração
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <FormControl fullWidth>
              <InputLabel>Tema</InputLabel>
              <Select label="Tema" value={form.theme} onChange={e => set('theme', e.target.value)}>
                <MenuItem value="agrosys">Agrosys</MenuItem>
                <MenuItem value="aliare">Aliare</MenuItem>
              </Select>
            </FormControl>
            <TextField fullWidth label="Nome" value={form.name} onChange={e => set('name', e.target.value)} />
            <TextField
              type="number"
              label="Prioridade"
              value={form.priority}
              onChange={e => set('priority', e.target.value)}
            />
          </Stack>
          <FormControlLabel
            control={<Switch checked={form.isDefault} onChange={e => set('isDefault', e.target.checked)} />}
            label="Configuração padrão (fallback)"
          />
          {!form.isDefault && (
            <>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField
                  fullWidth
                  type="date"
                  label="Início"
                  InputLabelProps={{ shrink: true }}
                  value={form.startDate}
                  onChange={e => set('startDate', e.target.value)}
                />
                <TextField
                  fullWidth
                  type="date"
                  label="Fim"
                  InputLabelProps={{ shrink: true }}
                  value={form.endDate}
                  onChange={e => set('endDate', e.target.value)}
                />
              </Stack>
              <Box>
                <Typography variant="caption">Dias da semana</Typography>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  {days.map((label, index) => (
                    <Button
                      key={label}
                      size="small"
                      variant={form.weekdays.includes(index) ? 'contained' : 'outlined'}
                      onClick={() => toggleDay(index)}
                    >
                      {label}
                    </Button>
                  ))}
                </Stack>
              </Box>
              <TextField
                label="Datas específicas"
                helperText="Separe por vírgulas. Ex.: 2026-12-24, 2026-12-31"
                value={form.specificDates}
                onChange={e => set('specificDates', e.target.value)}
              />
            </>
          )}
          <Typography variant="subtitle2">Imagens</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Box flex={1}>
              <Typography variant="caption">Logo</Typography>
              <input type="file" accept="image/*" onChange={e => setLogo(e.target.files?.[0])} />
            </Box>
            <Box flex={1}>
              <Typography variant="caption">Plano de fundo</Typography>
              <input type="file" accept="image/*" onChange={e => setBackground(e.target.files?.[0])} />
            </Box>
            {form.theme === 'aliare' && (
              <Box flex={1}>
                <Typography variant="caption">Imagens de início</Typography>
                <input multiple type="file" accept="image/*" onChange={e => setStartImages([...e.target.files])} />
              </Box>
            )}
          </Stack>
          {form.theme === 'aliare' && (
            <>
              <Typography variant="subtitle2">Fonte e cores</Typography>
              <TextField
                label="Fonte do sistema"
                placeholder="Ex.: Segoe UI"
                value={form.fontFamily}
                onChange={e => set('fontFamily', e.target.value)}
              />
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)' }, gap: 1 }}>
                {[
                  ['borderColor', 'Cor padrão da borda'],
                  ['fontColor', 'Cor padrão da fonte'],
                  ['errorColor', 'Erro'],
                  ['gridSelectionColor', 'Grid — cor da seleção'],
                  ['gridSelectionFontColor', 'Grid — fonte da seleção']
                ].map(([key, label]) => (
                  <TextField
                    key={key}
                    type="color"
                    label={label}
                    InputLabelProps={{ shrink: true }}
                    value={form[key]}
                    onChange={e => set(key, e.target.value)}
                  />
                ))}
              </Box>
              <Stack direction="row" spacing={1}>
                <TextField
                  type="number"
                  label="Largura da logo interna"
                  value={form.logoWidth}
                  onChange={e => set('logoWidth', e.target.value)}
                />
                <TextField
                  type="number"
                  label="Altura da logo interna"
                  value={form.logoHeight}
                  onChange={e => set('logoHeight', e.target.value)}
                />
              </Stack>
            </>
          )}
          <Button variant="contained" onClick={save} disabled={!form.name.trim()}>
            Salvar configuração
          </Button>
          <Typography variant="subtitle1" fontWeight={700} mt={2}>
            Configurações cadastradas
          </Typography>
          {items.length ? (
            items.map(item => (
              <Stack
                key={item.id}
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 1 }}
              >
                <Box flex={1}>
                  <Typography fontWeight={700}>
                    {item.name} — {item.theme === 'agrosys' ? 'Agrosys' : 'Aliare'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {item.isDefault ? 'Padrão' : `${item.startDate || 'sem início'} até ${item.endDate || 'sem fim'}`} ·
                    prioridade {item.priority}
                  </Typography>
                </Box>
                <Button color="error" onClick={() => remove(item)}>
                  Excluir
                </Button>
              </Stack>
            ))
          ) : (
            <Alert severity="info">Nenhuma personalização cadastrada.</Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Fechar</Button>
      </DialogActions>
    </Dialog>
  );
}
