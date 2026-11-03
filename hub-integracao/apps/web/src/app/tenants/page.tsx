import Link from 'next/link';
import { Chip, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { api } from '@/lib/api';
import { NovaEmpresa } from '@/components/EmpresaForm';
import { criarTenant } from './actions';

type Me = { usuario: { nome: string; is_super: boolean }; tenants: { id: string; nome: string; origem: 'agrosys' | 'api'; papel: string | null }[] };

const rotuloOrigem = { agrosys: 'Agrosys', api: 'API' } as const;

export default async function Tenants() {
  const me = await api<Me>('/v1/me');
  return (
    <Stack spacing={3}>
      <Paper sx={{ p: { xs: 2, md: 3 } }}>
        <Typography variant="h6" mb={2}>Empresas</Typography>
        <Table size="small">
          <TableHead>
            <TableRow><TableCell>Empresa</TableCell><TableCell>Origem da integração</TableCell><TableCell>Papel</TableCell></TableRow>
          </TableHead>
          <TableBody>
            {me.tenants.map((t) => (
              <TableRow key={t.id} hover>
                <TableCell><Link href={`/tenants/${t.id}`} style={{ color: '#177a52', fontWeight: 600 }}>{t.nome}</Link></TableCell>
                <TableCell><Chip label={rotuloOrigem[t.origem]} size="small" /></TableCell>
                <TableCell>{t.papel ?? 'administrador do Hub'}</TableCell>
              </TableRow>
            ))}
            {me.tenants.length === 0 && (
              <TableRow><TableCell colSpan={3}><Typography color="text.secondary">Nenhuma empresa ainda.</Typography></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
      {me.usuario.is_super && (
        <Paper sx={{ p: { xs: 2, md: 3 } }}>
          <Typography variant="h6" mb={2}>Nova empresa</Typography>
          <NovaEmpresa acao={criarTenant} />
        </Paper>
      )}
    </Stack>
  );
}
