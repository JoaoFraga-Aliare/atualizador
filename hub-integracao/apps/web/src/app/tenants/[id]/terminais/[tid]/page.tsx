import Link from 'next/link';
import { Box, Chip, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { gruposDe, parametros } from '@hub/contracts';
import { api } from '@/lib/api';
import { EditorParametros } from '@/components/EditorParametros';
import { salvarConfigTerminal } from '../../../actions';

type Config = {
  terminal: { id: string; nome: string }; origem: 'agrosys' | 'api'; versao: number;
  valores: Record<string, string | number | boolean | null>;
  padroes: Record<string, string | number | boolean | null>;
};

export default async function ConfigTerminal({ params }: { params: Promise<{ id: string; tid: string }> }) {
  const { id, tid } = await params;
  const cfg = await api<Config>(`/v1/tenants/${id}/terminals/${tid}/config`);
  const campos = parametros.filter((p) => !p.origem || p.origem === cfg.origem);

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Tooltip title="Empresa"><IconButton href={`/tenants/${id}`} color="primary"><ArrowBackIcon /></IconButton></Tooltip>
        <Typography variant="h4" component="h1">Parâmetros — {cfg.terminal.nome}</Typography>
        <Chip label={`Versão ${cfg.versao}`} />
      </Box>
      <Typography color="text.secondary">
        Antes ficavam na tabela <code>caixa</code> do PDV (tela “Parametrização PDV”). O terminal busca sozinho quando a versão
        muda. Campos vazios herdam o padrão da empresa, quando existir.
      </Typography>
      <EditorParametros
        acao={salvarConfigTerminal.bind(null, id, tid)}
        campos={campos}
        valores={cfg.valores}
        padroes={cfg.padroes}
        grupos={gruposDe(cfg.origem)}
        versao={cfg.versao}
      />
    </Stack>
  );
}
