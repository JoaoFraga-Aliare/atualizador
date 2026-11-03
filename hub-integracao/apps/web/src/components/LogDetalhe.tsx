'use client';

import { useState, useTransition } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Tooltip, Typography,
} from '@mui/material';
import { Visibility as VisibilityIcon } from '@mui/icons-material';

export type DetalheLog = {
  id: number; ocorrido_em: string; terminal: string | null; canal: string; metodo: string | null; rota: string;
  operacao: string | null; status_http: number | null; resultado: string; duracao_ms: number | null; itens: number | null;
  mensagem: string | null; req_corpo: string | null; resp_corpo: string | null; corpo_expira_em: string | null;
  corpo_expirado: boolean; relacionadas: { id: number; canal: string; operacao: string | null; resultado: string; duracao_ms: number | null }[];
};

// Strings que contêm JSON (ex.: "param" do SOAP) viram objeto, para não aparecerem cheias de \".
const desembrulhar = (v: unknown): unknown => {
  if (typeof v === 'string') {
    const t = v.trim();
    if (t.startsWith('{') || t.startsWith('[')) {
      try { return desembrulhar(JSON.parse(t)); } catch { /* texto comum */ }
    }
    return v;
  }
  if (Array.isArray(v)) return v.map(desembrulhar);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, desembrulhar(x)]));
  return v;
};

// JSON legível quando o texto é JSON; senão o texto como veio.
const formatar = (t: string | null) => {
  if (!t) return '';
  try { return JSON.stringify(desembrulhar(JSON.parse(t)), null, 2); } catch { return t; }
};

const Corpo = ({ titulo, texto }: { titulo: string; texto: string | null }) => (
  <Box sx={{ mb: 2 }}>
    <Typography variant="subtitle2" mb={0.5}>{titulo}</Typography>
    {texto
      ? <Box component="pre" sx={{ m: 0, maxHeight: 280, overflow: 'auto', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{formatar(texto)}</Box>
      : <Typography variant="body2" color="text.secondary">—</Typography>}
  </Box>
);

export function LogDetalhe({ logId, buscar }: { logId: number; buscar: (id: number) => Promise<DetalheLog | { erro: string }> }) {
  const [aberto, setAberto] = useState(false);
  const [dado, setDado] = useState<DetalheLog | null>(null);
  const [erro, setErro] = useState('');
  const [carregando, iniciar] = useTransition();

  const abrir = () => {
    setAberto(true); setDado(null); setErro('');
    iniciar(async () => {
      const r = await buscar(logId);
      if ('erro' in r) setErro(r.erro); else setDado(r);
    });
  };

  return (
    <>
      <Tooltip title="Ver detalhes">
        <IconButton size="small" onClick={abrir} aria-label={`Detalhes da requisição ${logId}`}><VisibilityIcon fontSize="small" /></IconButton>
      </Tooltip>
      <Dialog open={aberto} onClose={() => setAberto(false)} fullWidth maxWidth="md">
        <DialogTitle>Requisição #{logId}</DialogTitle>
        <DialogContent dividers>
          {carregando && <Box sx={{ display: 'grid', placeItems: 'center', p: 4 }}><CircularProgress /></Box>}
          {erro && <Alert severity="error">{erro}</Alert>}
          {dado && (
            <>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                <Chip label={dado.canal} size="small" />
                <Chip label={dado.resultado} size="small" color={dado.resultado === 'ok' ? 'success' : dado.resultado === 'erro' ? 'error' : 'warning'} />
                {dado.status_http && <Chip label={`HTTP ${dado.status_http}`} size="small" />}
                {dado.duracao_ms !== null && <Chip label={`${dado.duracao_ms} ms`} size="small" />}
                {dado.itens !== null && <Chip label={`${dado.itens} item(ns)`} size="small" />}
                {dado.terminal && <Chip label={dado.terminal} size="small" />}
              </Box>
              <Typography variant="body2" mb={0.5}>
                {new Date(dado.ocorrido_em).toLocaleString('pt-BR')} · <code>{dado.metodo} {dado.rota}</code>{dado.operacao ? ` · ${dado.operacao}` : ''}
              </Typography>
              {dado.mensagem && <Typography variant="body2" mb={2}><strong>Mensagem:</strong> {dado.mensagem}</Typography>}

              {dado.corpo_expirado
                ? <Alert severity="info" sx={{ mb: 2 }}>O conteúdo enviado/recebido já expirou (fica disponível só por algumas horas). A requisição e o status continuam registrados.</Alert>
                : dado.corpo_expira_em && <Typography variant="caption" color="text.secondary" display="block" mb={2}>
                    Conteúdo disponível até {new Date(dado.corpo_expira_em).toLocaleString('pt-BR')}. Senhas e tokens são ocultados.
                  </Typography>}
              {!dado.corpo_expirado && <>
                <Corpo titulo="Enviado" texto={dado.req_corpo} />
                <Corpo titulo="Recebido" texto={dado.resp_corpo} />
              </>}

              {dado.relacionadas.length > 0 && (
                <>
                  <Typography variant="subtitle2" mb={0.5}>Chamadas relacionadas</Typography>
                  {dado.relacionadas.map((r) => (
                    <Typography key={r.id} variant="body2">#{r.id} · {r.canal} · {r.operacao ?? ''} · {r.resultado} · {r.duracao_ms ?? 0} ms</Typography>
                  ))}
                </>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => setAberto(false)}>Fechar</Button></DialogActions>
      </Dialog>
    </>
  );
}
