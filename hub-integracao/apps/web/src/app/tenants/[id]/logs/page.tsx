import {
  Box, Button, Chip, IconButton, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { api } from '@/lib/api';
import { LogDetalhe } from '@/components/LogDetalhe';
import { AutoAtualizar } from '@/components/AutoAtualizar';
import { buscarLog } from '../../actions';

type Linha = {
  id: number; ocorrido_em: string; terminal: string | null; canal: string; metodo: string | null; rota: string; operacao: string | null;
  status_http: number | null; resultado: string; duracao_ms: number | null; itens: number | null; mensagem: string | null;
  tem_corpo: boolean; corpo_expira_em: string | null;
};
type Terminal = { id: string; nome: string };

const LIMITE = 50;
const corResultado: Record<string, 'success' | 'warning' | 'error'> = { ok: 'success', recusado: 'warning', erro: 'error' };
const rotuloCanal: Record<string, string> = { 'terminal->hub': 'Terminal → Hub', 'hub->erp': 'Hub → ERP', 'cliente->hub': 'Cliente → Hub' };

export default async function LogsPagina({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const f = await searchParams;
  const qs = new URLSearchParams();
  for (const k of ['terminal', 'canal', 'resultado', 'rota', 'antes']) if (f[k]) qs.set(k, f[k]!);
  if (f.ocultarVazias === '1') qs.set('ocultarVazias', '1');
  qs.set('limite', String(LIMITE));

  const [linhas, terminais] = await Promise.all([
    api<Linha[]>(`/v1/tenants/${id}/logs?${qs}`),
    api<Terminal[]>(`/v1/tenants/${id}/terminals`),
  ]);

  const proxima = linhas.length === LIMITE ? new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v) as [string, string][]), antes: String(linhas[linhas.length - 1].id) }) : null;

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Tooltip title="Empresa"><IconButton href={`/tenants/${id}`} color="primary"><ArrowBackIcon /></IconButton></Tooltip>
        <Typography variant="h4" component="h1">Log de requisições</Typography>
        <Box sx={{ flex: 1 }} />
        <AutoAtualizar />
      </Box>

      <Paper sx={{ p: { xs: 2, md: 3 } }}>
        <Box component="form" method="get" sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-end', mb: 3 }}>
          <TextField select name="terminal" label="Terminal" defaultValue={f.terminal ?? ''} sx={{ minWidth: 180 }} slotProps={{ inputLabel: { shrink: true } }}>
            <MenuItem value="">Todos</MenuItem>
            {terminais.map((t) => <MenuItem key={t.id} value={t.id}>{t.nome}</MenuItem>)}
          </TextField>
          <TextField select name="canal" label="Canal" defaultValue={f.canal ?? ''} sx={{ minWidth: 170 }} slotProps={{ inputLabel: { shrink: true } }}>
            <MenuItem value="">Todos</MenuItem>
            {Object.entries(rotuloCanal).map(([v, r]) => <MenuItem key={v} value={v}>{r}</MenuItem>)}
          </TextField>
          <TextField select name="resultado" label="Resultado" defaultValue={f.resultado ?? ''} sx={{ minWidth: 150 }} slotProps={{ inputLabel: { shrink: true } }}>
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value="ok">ok</MenuItem><MenuItem value="recusado">recusado</MenuItem><MenuItem value="erro">erro</MenuItem>
          </TextField>
          <TextField name="rota" label="Rota ou operação" defaultValue={f.rota ?? ''} placeholder="PDVCLIENTE, /v1/sync…" slotProps={{ inputLabel: { shrink: true } }} />
          <TextField select name="ocultarVazias" label="Consultas sem novidade" defaultValue={f.ocultarVazias ?? '0'} sx={{ minWidth: 190 }} slotProps={{ inputLabel: { shrink: true } }}>
            <MenuItem value="0">Mostrar</MenuItem><MenuItem value="1">Ocultar</MenuItem>
          </TextField>
          <Button type="submit" variant="contained">Filtrar</Button>
          <Button href={`/tenants/${id}/logs`} variant="outlined">Limpar</Button>
        </Box>

        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Quando</TableCell><TableCell>Terminal</TableCell><TableCell>Canal</TableCell><TableCell>Operação</TableCell>
              <TableCell>Resultado</TableCell><TableCell align="right">Itens</TableCell><TableCell align="right">Tempo</TableCell>
              <TableCell>Mensagem</TableCell><TableCell align="right"> </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {linhas.map((l) => (
              <TableRow key={l.id} hover>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(l.ocorrido_em).toLocaleString('pt-BR')}</TableCell>
                <TableCell>{l.terminal ?? '—'}</TableCell>
                <TableCell>{rotuloCanal[l.canal] ?? l.canal}</TableCell>
                <TableCell><code>{l.operacao ?? l.rota}</code></TableCell>
                <TableCell>
                  <Chip size="small" color={corResultado[l.resultado] ?? 'default'} label={l.status_http ? `${l.resultado} · ${l.status_http}` : l.resultado} />
                </TableCell>
                <TableCell align="right">{l.itens ?? ''}</TableCell>
                <TableCell align="right">{l.duracao_ms !== null ? `${l.duracao_ms} ms` : ''}</TableCell>
                <TableCell sx={{ maxWidth: 320 }}>{l.mensagem ?? ''}</TableCell>
                <TableCell align="right"><LogDetalhe logId={l.id} buscar={buscarLog.bind(null, id)} /></TableCell>
              </TableRow>
            ))}
            {linhas.length === 0 && <TableRow><TableCell colSpan={9}><Typography color="text.secondary">Nenhuma requisição com esses filtros.</Typography></TableCell></TableRow>}
          </TableBody>
        </Table>
        {proxima && (
          <Box sx={{ mt: 2 }}><Button href={`/tenants/${id}/logs?${proxima}`}>Próximas {LIMITE}</Button></Box>
        )}
        <Typography variant="caption" color="text.secondary" display="block" mt={2}>
          O conteúdo enviado/recebido fica disponível só por algumas horas; depois ficam a requisição e o status.
        </Typography>
      </Paper>
    </Stack>
  );
}
