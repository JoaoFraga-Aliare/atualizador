'use client';
import { useState } from 'react';
import { Alert, Box, Button, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { Download as DownloadIcon } from '@mui/icons-material';
import { api } from '../../lib/api';
import { hubError } from './HubUi';

const section = { p: { xs: 2, md: 3 } };

// Baixa um JSON gerado pelo Hub (com o endereco da API ja preenchido) como arquivo.
async function download(kind, filename) {
  const data = await api(`/admin/hub/postman/${kind}`),
    blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// Hub > Documentacao > Postman: a collection com todas as operacoes da API e como usar.
export default function PostmanDoc({ base }) {
  const [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    run = (kind, filename) => async () => {
      setBusy(kind);
      setError('');
      try {
        await download(kind, filename);
      } catch (e) {
        setError(hubError(e).error);
      }
      setBusy('');
    };
  return (
    <Stack spacing={3}>
      <Paper sx={section}>
        <Typography variant="h5" component="h2" mb={1}>
          Postman
        </Typography>
        <Typography mb={2}>
          A collection traz <strong>todas as operações da API</strong> do Hub, uma pasta por recurso, com um exemplo de
          corpo em cada requisição. Ela é montada a partir dos contratos atuais, então está sempre igual à documentação
          desta tela.
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <Button
            variant="contained"
            startIcon={<DownloadIcon />}
            disabled={Boolean(busy)}
            onClick={run('collection', 'Hub-API.postman_collection.json')}
          >
            {busy === 'collection' ? 'Baixando…' : 'Baixar a collection'}
          </Button>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            disabled={Boolean(busy)}
            onClick={run('environment', 'Hub.postman_environment.json')}
          >
            {busy === 'environment' ? 'Baixando…' : 'Baixar o ambiente'}
          </Button>
        </Stack>
        <Typography variant="body2" color="text.secondary" mt={1.5}>
          Os arquivos já vêm com o endereço da API ({base || 'configurado no servidor'}) na variável{' '}
          <code>baseUrl</code>.
        </Typography>
      </Paper>

      <Paper sx={section}>
        <Typography variant="h6" mb={1}>
          Como usar
        </Typography>
        <Typography variant="body2" component="ol" sx={{ pl: 2.5, mt: 0, mb: 0 }}>
          <li>No Postman, <strong>Import</strong> e escolha os dois arquivos; selecione o ambiente <strong>Hub</strong>.</li>
          <li>
            Preencha só o que a pasta usa: <code>apiKey</code> (chave <code>hk_…</code> do cliente, em Chaves de API),
            ou <code>email</code> e <code>senha</code> do seu usuário, ou <code>terminalToken</code> (<code>tk_…</code>).
          </li>
          <li>
            Pasta <strong>2. Gerencial</strong>: rode <em>Login</em> (guarda o <code>jwt</code>) e <em>Quem sou eu</em>{' '}
            (guarda o <code>tenantId</code>).
          </li>
          <li>
            Pasta <strong>1. API do sistema do cliente</strong>: cada envio guarda o <code>recordId</code> para
            consultar, alterar, pausar, retomar e remover o mesmo registro.
          </li>
        </Typography>
        <Table size="small" sx={{ mt: 2 }}>
          <TableHead>
            <TableRow>
              <TableCell>Pasta</TableCell>
              <TableCell>Credencial</TableCell>
              <TableCell>Variável</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {[
              ['1. API do sistema do cliente', 'chave de API da empresa', 'apiKey'],
              ['2. Gerencial', 'JWT do login', 'jwt'],
              ['3. Terminal', 'token do caixa', 'terminalToken']
            ].map(([a, b, c]) => (
              <TableRow key={a}>
                <TableCell>{a}</TableCell>
                <TableCell>{b}</TableCell>
                <TableCell>
                  <code>{c}</code>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Stack>
  );
}
