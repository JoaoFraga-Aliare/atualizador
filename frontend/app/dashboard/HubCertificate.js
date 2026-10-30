'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, Paper, Stack, TextField, Typography } from '@mui/material';
import {
  AttachFile as AttachFileIcon,
  DeleteOutline as DeleteOutlineIcon,
  Upload as UploadIcon
} from '@mui/icons-material';
import { Grid } from './components';
import { formatDocument } from './format';
import { ActionButton, Notice, hubApi, hubError, hubSend, when } from './HubUi';

const section = { p: { xs: 2, md: 3 } };
const eventLabel = { envio: 'Envio', remocao: 'Remoção', download: 'Download pelo terminal' };

// Arquivo -> base64 (so o conteudo; o arquivo nunca e guardado no navegador).
const readBase64 = file =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });

function daysChip(days) {
  if (days < 0) return <Chip size="small" color="error" label={`vencido há ${-days} dia(s)`} />;
  if (days <= 30) return <Chip size="small" color="warning" label={`vence em ${days} dia(s)`} />;
  return <Chip size="small" color="success" label={`${days} dias restantes`} />;
}

// Certificado digital A1 do cliente: enviado uma vez, guardado cifrado no Hub e entregue ao terminal
// (Integrador) por canal autenticado. O arquivo e a senha nunca voltam para esta tela.
export default function HubCertificate({ tenantId, canEdit }) {
  const [info, setInfo] = useState(null),
    [access, setAccess] = useState([]),
    [notice, setNotice] = useState(null),
    [file, setFile] = useState(null),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    input = useRef(null),
    load = useCallback(async () => {
      try {
        const [meta, list] = await Promise.all([
          hubApi(`/tenants/${tenantId}/certificado`),
          hubApi(`/tenants/${tenantId}/certificado/acessos`)
        ]);
        setInfo(meta);
        setAccess(list);
      } catch (e) {
        setNotice(hubError(e));
      }
    }, [tenantId]);
  useEffect(() => {
    load();
  }, [load]);

  async function send(e) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    try {
      const r = await hubSend(`/tenants/${tenantId}/certificado`, 'PUT', {
        pfx: await readBase64(file),
        senha: password,
        nome: file.name
      });
      setNotice({
        ok: `Certificado de ${r.titular} guardado (versão ${r.versao}). Os terminais baixam na próxima sincronização.${r.aviso ? ` Atenção: ${r.aviso}` : ''}`
      });
      setFile(null);
      setPassword('');
      if (input.current) input.current.value = '';
      await load();
    } catch (err) {
      setNotice(hubError(err));
    }
    setBusy(false);
  }
  const remove = async () => {
    try {
      await hubApi(`/tenants/${tenantId}/certificado`, { method: 'DELETE' });
      setNotice({ ok: 'Certificado removido. Os terminais deixam de recebê-lo.' });
      await load();
    } catch (err) {
      setNotice(hubError(err));
    }
  };

  if (!info)
    return <Stack spacing={2}>{notice ? <Notice value={notice} /> : <Typography>Carregando…</Typography>}</Stack>;
  return (
    <Stack spacing={3}>
      <Notice value={notice} close={() => setNotice(null)} />
      <Paper sx={section}>
        <Typography variant="h6" mb={0.5}>
          Certificado digital (A1)
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          O arquivo .pfx e a senha são guardados <strong>cifrados</strong> no Hub. Depois do envio, ninguém consegue
          baixar o arquivo nem ver a senha: só substituir ou remover. O terminal recebe uma cópia protegida pelo
          Windows, por canal autenticado. Certificado em token ou cartão (A3) não pode ser enviado.
        </Typography>
        {info.existe ? (
          <Stack spacing={1}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography fontWeight={700}>{info.titular}</Typography>
              {daysChip(info.dias_restantes)}
            </Box>
            <Typography variant="body2">
              CNPJ {info.cnpj ? formatDocument(info.cnpj) : '—'} · série <code>{info.serie}</code> · válido até{' '}
              {when(info.valido_ate)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Versão {info.versao} · {info.nome} · enviado em {when(info.enviado_em)}
            </Typography>
            {canEdit && (
              <Box>
                <ActionButton
                  label="Remover certificado"
                  icon={DeleteOutlineIcon}
                  color="error"
                  confirm="Remover o certificado? Os terminais deixam de recebê-lo e não conseguirão assinar notas novas depois que o cache local vencer."
                  run={remove}
                />
              </Box>
            )}
          </Stack>
        ) : (
          <Alert severity="info">Nenhum certificado enviado para este cliente.</Alert>
        )}
      </Paper>

      {canEdit && (
        <Paper sx={section}>
          <Typography variant="h6" mb={2}>
            {info.existe ? 'Substituir certificado' : 'Enviar certificado'}
          </Typography>
          <Box
            component="form"
            onSubmit={send}
            sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}
          >
            <Box>
              <Button variant="outlined" component="label" startIcon={<AttachFileIcon />}>
                {file ? file.name : 'Escolher arquivo .pfx'}
                <input
                  ref={input}
                  hidden
                  type="file"
                  accept=".pfx,.p12"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                />
              </Button>
            </Box>
            <TextField
              label="Senha do certificado"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              sx={{ minWidth: 260 }}
            />
            <Button type="submit" variant="contained" startIcon={<UploadIcon />} disabled={busy || !file || !password}>
              {busy ? 'Enviando…' : 'Enviar'}
            </Button>
          </Box>
          <Typography variant="caption" color="text.secondary" display="block" mt={1}>
            O Hub confere a senha, a validade e se o CNPJ do certificado tem a mesma raiz do emitente.
          </Typography>
        </Paper>
      )}

      <Paper sx={section}>
        <Typography variant="h6" mb={2}>
          Histórico de acessos
        </Typography>
        <Grid
          heads={['Quando', 'Evento', 'Versão', 'Quem', 'IP']}
          rows={access.map(a => [
            when(a.em),
            eventLabel[a.evento] ?? a.evento,
            a.versao ?? '—',
            a.terminal ? `Terminal ${a.terminal}` : a.usuario ? 'Usuário do painel' : '—',
            a.ip ?? '—'
          ])}
        />
      </Paper>
    </Stack>
  );
}
