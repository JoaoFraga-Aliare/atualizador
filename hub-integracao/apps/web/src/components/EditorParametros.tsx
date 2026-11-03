'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import {
  Alert, Badge, Box, Button, Checkbox, FormControlLabel, InputAdornment, List, ListItemButton, ListItemText,
  Paper, TextField, Typography,
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';
import type { ParametroDef } from '@hub/contracts';
import type { Estado } from '@/app/tenants/actions';

type Valor = string | number | boolean | null | undefined;

function Campo({ p, valor, padrao }: { p: ParametroDef; valor: Valor; padrao: Valor }) {
  const nome = `p__${p.campo}`;
  const dica = padrao !== undefined && padrao !== null ? `padrão da empresa: ${padrao}` : p.campo;
  const flex = `1 1 ${Math.max(Math.min(p.largura, 100), 25) * 3}px`;
  const base = { name: nome, label: p.rotulo, title: p.campo, sx: { flex, minWidth: 180 }, slotProps: { inputLabel: { shrink: true } } } as const;

  if (p.tipo === 'booleano') {
    return (
      <FormControlLabel sx={{ flex, minWidth: 180 }} title={p.campo}
        control={<Checkbox name={nome} defaultChecked={valor === true} />} label={p.rotulo} />
    );
  }
  if (p.opcoes) {
    // <select> nativo: dispara o evento de mudança do DOM (usado para marcar o campo como alterado).
    return (
      <TextField {...base} select defaultValue={valor === undefined || valor === null ? '' : String(valor)}
        slotProps={{ inputLabel: { shrink: true }, select: { native: true } }}>
        <option value="">—</option>
        {p.opcoes.map((o, i) => <option key={o} value={p.valorPorIndice ? String(i) : o}>{o}</option>)}
      </TextField>
    );
  }
  const numerico = p.tipo === 'inteiro' || p.tipo === 'decimal' || p.controle === 'minmax';
  return (
    <TextField {...base} type={p.tipo === 'data' ? 'date' : numerico ? 'number' : 'text'}
      defaultValue={valor === undefined || valor === null ? '' : String(valor)} placeholder={dica}
      helperText={p.listaDoDispositivo ? 'Depende da máquina (porta/modelo): informe o valor usado no PDV.' : undefined}
      slotProps={{
        inputLabel: { shrink: true },
        htmlInput: { step: p.tipo === 'decimal' ? 'any' : undefined, min: p.controle === 'minmax' ? p.minimo : undefined, max: p.controle === 'minmax' ? p.maximo : undefined },
      }} />
  );
}

// Tela "Parametrização PDV" no Hub: grupos à esquerda, busca, campos por tipo.
// Todos os grupos ficam montados (só um visível), então trocar de grupo não perde o
// que foi digitado; o envio leva apenas os campos alterados.
export function EditorParametros({ acao, campos, valores, padroes, grupos, versao }: {
  acao: (e: Estado, d: FormData) => Promise<Estado>;
  campos: ParametroDef[];
  valores: Record<string, Valor>;
  padroes: Record<string, Valor>;
  grupos: string[];
  versao: number;
}) {
  const [estado, enviar, pendente] = useActionState<Estado, FormData>(acao, {});
  const [grupo, setGrupo] = useState(grupos[0] ?? '');
  const [busca, setBusca] = useState('');
  const [alterados, setAlterados] = useState<string[]>([]);

  // grupo escolhido fica no endereço (#Emitente): recarregar ou compartilhar mantém a tela
  useEffect(() => {
    const h = decodeURIComponent(location.hash.slice(1));
    if (h && grupos.includes(h)) setGrupo(h);
  }, [grupos]);
  const escolher = (g: string) => { setBusca(''); setGrupo(g); history.replaceState(null, '', `#${encodeURIComponent(g)}`); };

  // salvou: zera a lista de alterados (a versão nova remonta os campos com os valores salvos)
  useEffect(() => { if (estado.ok) setAlterados([]); }, [estado]);

  const marcar = (e: React.FormEvent<HTMLFormElement>) => {
    const nome = (e.target as HTMLInputElement | HTMLSelectElement).name ?? '';
    if (!nome.startsWith('p__')) return;
    const campo = nome.slice(3);
    setAlterados((a) => (a.includes(campo) ? a : [...a, campo]));
  };

  const q = busca.trim().toLowerCase();
  const casa = (c: ParametroDef) => !q || c.rotulo.toLowerCase().includes(q) || c.campo.toLowerCase().includes(q);
  const porGrupo = useMemo(() => grupos.map((g) => ({ g, itens: campos.filter((c) => c.grupo === g) })), [grupos, campos]);
  const alteradosDe = (g: string) => alterados.filter((c) => campos.find((x) => x.campo === c)?.grupo === g).length;

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '280px 1fr' }, gap: 3, alignItems: 'start' }}>
      <Paper sx={{ p: 1.5, position: { md: 'sticky' }, top: { md: 88 } }}>
        <TextField fullWidth placeholder="Pesquisar parâmetro" value={busca} onChange={(e) => setBusca(e.target.value)}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          sx={{ mb: 1 }} />
        <List component="nav" aria-label="Grupos de parâmetros" disablePadding>
          {porGrupo.map(({ g, itens }) => {
            const ativo = !q && g === grupo;
            const n = alteradosDe(g);
            return (
              <ListItemButton key={g} selected={ativo} onClick={() => escolher(g)}
                sx={{ borderRadius: 2, mb: 0.25, color: ativo ? 'primary.dark' : 'text.secondary', bgcolor: ativo ? 'primary.light' : 'transparent' }}>
                <ListItemText primary={g} primaryTypographyProps={{ fontWeight: 600, fontSize: 14 }} />
                {n > 0 && <Badge color="warning" badgeContent={n} sx={{ mr: 2 }} />}
                <Typography variant="caption" color="text.secondary">{itens.length}</Typography>
              </ListItemButton>
            );
          })}
        </List>
      </Paper>

      <Paper component="form" action={enviar} onChange={marcar} sx={{ p: { xs: 2, md: 3 } }}>
        {alterados.map((c) => <input key={c} type="hidden" name="campos" value={c} />)}
        <Box key={versao}>
          {porGrupo.map(({ g, itens }) => {
            const visiveis = itens.filter(casa);
            const mostrar = q ? visiveis.length > 0 : g === grupo;
            const subgrupos = [...new Set(visiveis.map((c) => c.subgrupo ?? ''))];
            return (
              <Box key={g} hidden={!mostrar}>
                <Typography variant="h6" mb={2}>{g}</Typography>
                {subgrupos.map((sg) => (
                  <Box key={sg || '_'} sx={{ mb: 2 }}>
                    {sg && <Typography variant="subtitle2" color="text.secondary" mb={1.5}>{sg}</Typography>}
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                      {visiveis.filter((c) => (c.subgrupo ?? '') === sg).map((c) => (
                        <Campo key={c.campo} p={c} valor={valores[c.campo]} padrao={padroes[c.campo]} />
                      ))}
                    </Box>
                  </Box>
                ))}
              </Box>
            );
          })}
          {q && !campos.some(casa) && <Typography color="text.secondary">Nenhum parâmetro encontrado.</Typography>}
        </Box>

        <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid #e4e8ee', display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button type="submit" variant="contained" disabled={pendente || alterados.length === 0}>
            {pendente ? 'Salvando…' : 'Salvar alterações'}
          </Button>
          <Typography variant="body2" color="text.secondary">
            {alterados.length ? `${alterados.length} parâmetro(s) alterado(s)` : 'Nenhuma alteração'}
          </Typography>
          {estado.erro && <Alert severity="error" sx={{ flex: '1 1 100%' }}>{estado.erro}</Alert>}
          {estado.ok && <Alert severity="success" sx={{ flex: '1 1 100%' }}>{estado.ok}</Alert>}
        </Box>
      </Paper>
    </Box>
  );
}
