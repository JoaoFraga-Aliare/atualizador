'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  Switch,
  TextField,
  ListItemIcon,
  Menu,
  MenuItem,
  Tooltip,
  Typography
} from '@mui/material';
import {
  Add as AddIcon,
  ArrowBack as ArrowBackIcon,
  Block as BlockIcon,
  Replay as ReplayIcon,
  Save as SaveIcon,
  Sync as SyncIcon,
  ContentCopy as ContentCopyIcon,
  DeleteOutline as DeleteOutlineIcon,
  Edit as EditIcon,
  MoreVert as MoreVertIcon,
  People as PeopleIcon,
  ReceiptLong as ReceiptLongIcon,
  VpnKey as VpnKeyIcon,
  Webhook as WebhookIcon,
  WorkspacePremium as WorkspacePremiumIcon,
  Storage as StorageIcon,
  Tune as TuneIcon
} from '@mui/icons-material';
import { Grid } from './components';
import { formatDocument } from './format';
import { AgrosysFields, EnvironmentChip, agrosysDefaults } from './HubClients';
import HubTerminalConfig from './HubTerminalConfig';
import HubLogs from './HubLogs';
import HubMirror from './HubMirror';
import HubWebhooks from './HubWebhooks';
import HubCertificate from './HubCertificate';
import { ActionButton, ActionForm, IconAction, Notice, SecretDialog, hubApi, hubError, hubSend, when } from './HubUi';

const connectionColor = { online: 'success', recente: 'warning', offline: 'error', nunca: 'default' };
const connectionLabel = { online: 'online', recente: 'visto há pouco', offline: 'offline', nunca: 'nunca conectou' };
const resultColor = r => (r === 'ok' ? 'success' : r === 'erro' ? 'error' : 'warning');
const sendColor = { enviado: 'success', pendente: 'warning', recusado: 'error', erro: 'error' };
const section = { p: { xs: 2, md: 3 } };
const environments = [
  ['producao', 'Produção'],
  ['homologacao', 'Homologação']
];

// Ambiente do terminal: producao (vende de verdade) ou homologacao (testes).
function TerminalEnvironment({ value }) {
  return value === 'homologacao' ? (
    <Chip size="small" color="warning" variant="outlined" label="Homologação" />
  ) : (
    <Chip size="small" color="success" variant="outlined" label="Produção" />
  );
}

function Section({ title, text, action, children }) {
  return (
    <Paper sx={section}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2 }}>
        <Box>
          <Typography variant="h6">{title}</Typography>
          {text && (
            <Typography variant="body2" color="text.secondary">
              {text}
            </Typography>
          )}
        </Box>
        {action}
      </Box>
      {children}
    </Paper>
  );
}

// Editar terminal existente: nome, codigo e AMBIENTE. Mudar o ambiente muda o con_tpamb que o PDV recebe (1 producao,
// 2 homologacao) e, portanto, em que SEFAZ a nota e emitida: pede confirmacao.
function EditDialog({ terminal, close, run, forceHomologation }) {
  const [values, setValues] = useState({}),
    [confirmed, setConfirmed] = useState(false);
  if (!terminal) return null;
  const name = values.nome ?? terminal.nome,
    code = values.codigoLegado ?? terminal.codigo_legado ?? '',
    environment = forceHomologation ? 'homologacao' : (values.ambiente ?? terminal.ambiente ?? 'producao'),
    changedEnv = environment !== (terminal.ambiente ?? 'producao'),
    changed = changedEnv || name !== terminal.nome || code !== (terminal.codigo_legado ?? '');
  return (
    <Dialog open onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>Editar terminal</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label="Nome do caixa" value={name} onChange={e => setValues({ ...values, nome: e.target.value })} />
          <TextField
            label="Código no PDV (cai_codigo)"
            value={code}
            onChange={e => setValues({ ...values, codigoLegado: e.target.value })}
          />
          <TextField
            select
            label="Ambiente"
            value={environment}
            disabled={forceHomologation}
            helperText={
              forceHomologation
                ? 'Cliente de homologação: só terminais de homologação.'
                : 'Produção emite nota válida; homologação emite na SEFAZ de testes.'
            }
            onChange={e => {
              setValues({ ...values, ambiente: e.target.value });
              setConfirmed(false);
            }}
          >
            {environments.map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          {changedEnv && (
            <Alert severity={environment === 'producao' ? 'error' : 'warning'}>
              O PDV deste terminal passa a emitir nota em <strong>{environment === 'producao' ? 'PRODUÇÃO (valor fiscal)' : 'HOMOLOGAÇÃO (sem valor fiscal)'}</strong>{' '}
              na próxima consulta de configuração (con_tpamb = {environment === 'producao' ? 1 : 2}).
              <FormControlLabel
                sx={{ display: 'block', mt: 1 }}
                control={<Checkbox checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />}
                label="Confirmo a troca de ambiente"
              />
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancelar</Button>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          disabled={!changed || !name.trim() || (changedEnv && !confirmed)}
          onClick={() => run(terminal, { nome: name.trim(), codigoLegado: code.trim() || null, ambiente: environment })}
        >
          Salvar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// Replicar: terminal novo com os mesmos parametros do caixa, outro nome/codigo e token proprio.
function ReplicateDialog({ terminal, close, run, forceHomologation }) {
  const [values, setValues] = useState({});
  if (!terminal) return null;
  const environment = forceHomologation ? 'homologacao' : (values.ambiente ?? terminal.ambiente ?? 'producao');
  return (
    <Dialog open onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>Replicar terminal</DialogTitle>
      <DialogContent>
        <Typography sx={{ mb: 2 }}>
          Cria um terminal novo com os mesmos parâmetros de <strong>{terminal.nome}</strong>. Informe o nome e o código
          do novo caixa.
        </Typography>
        <Stack spacing={2}>
          <TextField
            label="Nome do novo caixa"
            placeholder="Caixa 02"
            value={values.nome ?? ''}
            onChange={e => setValues({ ...values, nome: e.target.value })}
          />
          <TextField
            label="Código no PDV (cai_codigo)"
            value={values.codigoLegado ?? ''}
            onChange={e => setValues({ ...values, codigoLegado: e.target.value })}
          />
          <TextField
            select
            label="Ambiente"
            value={environment}
            disabled={forceHomologation}
            helperText={forceHomologation ? 'Cliente de homologação: só terminais de homologação.' : undefined}
            onChange={e => setValues({ ...values, ambiente: e.target.value })}
          >
            {environments.map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancelar</Button>
        <Button
          variant="contained"
          startIcon={<ContentCopyIcon />}
          disabled={!(values.nome ?? '').trim()}
          onClick={() => run(terminal, { ...values, ambiente: environment })}
        >
          Replicar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function Defaults({ tenant, run }) {
  const [values, setValues] = useState(() => ({ ...tenant.padroes }));
  return (
    <Box
      component="form"
      onSubmit={e => {
        e.preventDefault();
        run(agrosysDefaults(values));
      }}
      sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-start' }}
    >
      <AgrosysFields values={values} set={(k, v) => setValues({ ...values, [k]: v })} />
      <IconAction title="Salvar padrões" icon={SaveIcon} type="submit" />
    </Box>
  );
}

export default function HubTenant({ id, sub = [], go, hubMe }) {
  const [data, setData] = useState(null),
    [notice, setNotice] = useState(null),
    [replicating, setReplicating] = useState(null),
    [editing, setEditing] = useState(null),
    [menuAnchor, setMenuAnchor] = useState(null),
    [creatingTerminal, setCreatingTerminal] = useState(false),
    [auto, setAuto] = useState(false),
    load = useCallback(async () => {
      try {
        const [tenant, terminals, runs, sends, connection, users] = await Promise.all([
          hubApi(`/tenants/${id}`),
          hubApi(`/tenants/${id}/terminals`),
          hubApi(`/tenants/${id}/sync-status`),
          hubApi(`/tenants/${id}/outbox/resumo`),
          hubApi(`/tenants/${id}/conexao`),
          hubApi(`/tenants/${id}/users`)
        ]);
        const keys = tenant.origem === 'agrosys' ? [] : await hubApi(`/tenants/${id}/api-keys`);
        setData({ tenant, terminals, runs, sends, connection, keys, users });
      } catch (e) {
        setNotice(hubError(e));
      }
    }, [id]);
  useEffect(() => {
    load();
  }, [load]);
  // Atualizacao automatica da conexao (o Integrador avisa a cada ~2 min).
  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [auto, load]);

  // Executa uma acao, mostra o resultado e recarrega.
  const act =
    fn =>
    async (...args) => {
      let result;
      try {
        result = await fn(...args);
      } catch (e) {
        result = hubError(e);
      }
      setNotice(result);
      if (!result.error) await load();
      return result;
    };

  // Enderecos: /hub/clientes/:id/ (principal), .../logs/[terminal]/, .../terminais/:tid/, .../dados/[entidade]/
  const open = (...parts) => go(`/hub/clientes/${id}/${parts.length ? parts.join('/') + '/' : ''}`),
    back = () => go('/hub/clientes/');
  if (!data)
    return <Stack spacing={2}>{notice ? <Notice value={notice} /> : <Typography>Carregando…</Typography>}</Stack>;
  const [area, first] = sub;
  if (area === 'terminais' && first) {
    const terminal = data.terminals.find(t => t.id === first);
    return terminal ? (
      <HubTerminalConfig tenantId={id} terminal={terminal} back={() => open()} />
    ) : (
      <Alert severity="warning">Terminal não encontrado.</Alert>
    );
  }
  if (area === 'logs') return <HubLogs tenantId={id} terminals={data.terminals} initial={first} back={() => open()} />;
  if (area === 'dados') return <HubMirror tenantId={id} entity={first} open={open} back={() => open()} />;

  const { tenant, terminals, runs, sends, connection, keys, users } = data,
    agrosys = tenant.origem === 'agrosys',
    canIntegrate = hubMe?.role === 'admin' || hubMe?.role === 'developer',
    // principal | chaves (so origem API) | usuarios
    page =
      area === 'chaves' && !agrosys
        ? 'keys'
        : area === 'certificado'
          ? 'certificate'
          : area === 'webhooks' && !agrosys
            ? 'webhooks'
            : area === 'usuarios'
              ? 'users'
              : 'main',
    pageTitle = { keys: 'Chaves de API', webhooks: 'Webhooks', users: 'Usuários', certificate: 'Certificado digital' }[
      page
    ];

  const newTerminal = act(async v => {
    const r = await hubSend(`/tenants/${id}/terminals`, 'POST', {
      nome: (v.nome || '').trim(),
      codigoLegado: (v.codigoLegado || '').trim() || undefined,
      ambiente: tenant.homologation ? 'homologacao' : v.ambiente || 'producao'
    });
    return { ok: 'Terminal criado. Copie o token e configure no Integrador: ele aparece só agora.', secret: r.token };
  });
  const editTerminal = act(async (terminal, v) => {
    const r = await hubSend(`/tenants/${id}/terminals/${terminal.id}`, 'PATCH', {
      nome: v.nome,
      codigoLegado: v.codigoLegado,
      ambiente: tenant.homologation ? 'homologacao' : v.ambiente
    });
    setEditing(null);
    return {
      ok:
        r.ambiente !== r.ambienteAnterior
          ? `Terminal atualizado. Ambiente: ${r.ambienteAnterior === 'producao' ? 'produção' : 'homologação'} → ${r.ambiente === 'producao' ? 'produção' : 'homologação'}. O PDV recebe na próxima consulta.`
          : 'Terminal atualizado.'
    };
  });
  const replicate = act(async (terminal, v) => {
    const r = await hubSend(`/tenants/${id}/terminals`, 'POST', {
      nome: v.nome.trim(),
      codigoLegado: (v.codigoLegado || '').trim() || undefined,
      ambiente: tenant.homologation ? 'homologacao' : v.ambiente || terminal.ambiente || 'producao',
      copiarDe: terminal.id
    });
    setReplicating(null);
    return {
      ok: 'Terminal replicado com os mesmos parâmetros. Copie o token e configure no Integrador: ele aparece só agora.',
      secret: r.token
    };
  });
  const newToken = act(async terminal => {
    const r = await hubSend(`/tenants/${id}/terminals/${terminal.id}/token`, 'POST');
    return { ok: 'Token anterior revogado. Novo token (aparece só agora):', secret: r.token };
  });
  // Cliente que nunca teve terminal conectado (e que nao e o de homologacao) pode ser excluido.
  const canDelete = !tenant.homologation && terminals.every(t => !t.ultimo_contato);
  async function removeTenant() {
    if (
      !window.confirm(
        `Excluir o cliente ${tenant.nome}? Os terminais, chaves de API e dados cadastrados nele serão apagados. Esta ação não pode ser desfeita.`
      )
    )
      return;
    try {
      await hubApi(`/tenants/${id}`, { method: 'DELETE' });
      back();
    } catch (e) {
      setNotice(hubError(e));
    }
  }
  const removeTerminal = act(async terminal => {
    await hubApi(`/tenants/${id}/terminals/${terminal.id}`, { method: 'DELETE' });
    return { ok: 'Terminal excluído.' };
  });
  const saveDefaults = act(async padroes => {
    await hubSend(`/tenants/${id}/padroes`, 'PUT', { padroes });
    return { ok: 'Padrões de conexão salvos. Os terminais passam a usá-los.' };
  });
  const syncNow = act(async () => {
    const r = await hubSend(`/tenants/${id}/sync`, 'POST');
    const changed = r.resultados.reduce((sum, x) => sum + x.mudadas, 0),
      failed = r.resultados.filter(x => x.erro);
    return failed.length
      ? {
          error: `${r.resultados.length - failed.length} entidade(s) ok, ${changed} linha(s) alterada(s). Com erro: ${failed.map(x => `${x.entidade} (${x.erro})`).join('; ')}`
        }
      : { ok: `${r.resultados.length} entidades sincronizadas, ${changed} linha(s) alterada(s).` };
  });
  const resend = act(async send => {
    const r = await hubSend(`/tenants/${id}/outbox/${send.id}/reenviar`, 'POST');
    return { ok: `Envio ${send.id}: ${r.status}.` };
  });
  const newKey = act(async v => {
    const r = await hubSend(`/tenants/${id}/api-keys`, 'POST', { nome: (v.nome || '').trim() });
    return { ok: 'Chave criada. Copie agora: ela não será mostrada de novo.', secret: r.chave };
  });
  const revokeKey = act(async key => {
    await hubApi(`/tenants/${id}/api-keys/${key.id}`, { method: 'DELETE' });
    return { ok: 'Chave revogada.' };
  });
  const newUser = act(async v => {
    await hubSend(`/tenants/${id}/users`, 'POST', {
      nome: (v.nome || '').trim(),
      email: (v.email || '').trim(),
      senha: v.senha || '',
      papel: 'integracao'
    });
    return { ok: 'Usuário de integração criado.' };
  });

  const activity = ultima =>
    ultima ? (
      <>
        <Chip size="small" color={resultColor(ultima.resultado)} label={ultima.operacao ?? 'sync'} />{' '}
        <Typography component="span" variant="caption" color="text.secondary">
          {when(ultima.ocorrido_em)}
        </Typography>
      </>
    ) : (
      '—'
    );

  return (
    <Stack spacing={3}>
      {/* Linha 1: voltar, nome do cliente e o menu (⋮) na ponta direita. Linha 2: origem, CNPJ e a tela atual. */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <Tooltip title="Clientes">
          <IconButton color="primary" onClick={page === 'main' ? back : () => open()} sx={{ mt: 0.25 }}>
            <ArrowBackIcon />
          </IconButton>
        </Tooltip>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h5" component="h2" sx={{ wordBreak: 'break-word' }}>
            {tenant.nome}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mt: 0.75 }}>
            <Chip size="small" label={`Origem: ${agrosys ? 'Agrosys' : 'API'}`} />
            <EnvironmentChip homologation={tenant.homologation} owner={hubMe?.role === 'admin' ? tenant.homologationOwner : null} />
            {tenant.documento && (
              <Typography variant="body2" color="text.secondary">
                {formatDocument(tenant.documento)}
              </Typography>
            )}
            {pageTitle && (
              <Typography variant="body2" color="text.secondary">
                · {pageTitle}
              </Typography>
            )}
          </Box>
        </Box>
        <Tooltip title="Chaves de API, webhooks, certificado e usuários">
          <IconButton
            aria-label="Mais opções do cliente"
            onClick={e => setMenuAnchor(e.currentTarget)}
            sx={{ mt: 0.25 }}
          >
            <MoreVertIcon />
          </IconButton>
        </Tooltip>
        <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
          {!agrosys && (
            <MenuItem
              onClick={() => {
                setMenuAnchor(null);
                open('chaves');
              }}
            >
              <ListItemIcon>
                <VpnKeyIcon fontSize="small" />
              </ListItemIcon>
              Chaves de API
            </MenuItem>
          )}
          {!agrosys && (
            <MenuItem
              onClick={() => {
                setMenuAnchor(null);
                open('webhooks');
              }}
            >
              <ListItemIcon>
                <WebhookIcon fontSize="small" />
              </ListItemIcon>
              Webhooks
            </MenuItem>
          )}
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              open('certificado');
            }}
          >
            <ListItemIcon>
              <WorkspacePremiumIcon fontSize="small" />
            </ListItemIcon>
            Certificado digital
          </MenuItem>
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              open('usuarios');
            }}
          >
            <ListItemIcon>
              <PeopleIcon fontSize="small" />
            </ListItemIcon>
            Usuários
          </MenuItem>
          {canDelete && (
            <MenuItem
              sx={{ color: 'error.main' }}
              onClick={() => {
                setMenuAnchor(null);
                removeTenant();
              }}
            >
              <ListItemIcon>
                <DeleteOutlineIcon fontSize="small" color="error" />
              </ListItemIcon>
              Excluir cliente
            </MenuItem>
          )}
        </Menu>
      </Box>
      <Notice value={notice && { ...notice, secret: undefined }} close={() => setNotice(null)} />
      <SecretDialog value={notice} close={() => setNotice(null)} />
      {tenant.homologation && page === 'main' && (
        <Alert severity="warning">
          Cliente de homologação{hubMe?.role === 'admin' && tenant.homologationOwner ? ` de ${tenant.homologationOwner}` : ''}
          : serve para testar a integração. Todos os terminais criados aqui são de homologação, e os dados não valem
          como venda real.
        </Alert>
      )}
      {page === 'keys' && (
        <Section
          title="Chaves de API"
          text="O sistema do cliente envia os cadastros com POST /v1/{recurso} e uma destas chaves (veja a Documentação)."
        >
          <Stack spacing={2}>
            <Grid
              heads={['Nome', 'Chave', 'Criada', 'Último uso', '']}
              rows={keys.map(k => [
                k.nome,
                <code key="p">{k.prefixo}…</code>,
                when(k.criado_em),
                k.ultimo_uso ? when(k.ultimo_uso) : 'nunca',
                <ActionButton
                  key="r"
                  label="Revogar"
                  icon={BlockIcon}
                  color="error"
                  confirm={`Revogar a chave ${k.nome}?`}
                  run={() => revokeKey(k)}
                />
              ])}
            />
            <ActionForm
              button="Criar chave"
              icon={AddIcon}
              run={newKey}
              fields={[{ name: 'nome', label: 'Nome da chave', required: true, placeholder: 'ERP do cliente' }]}
            />
          </Stack>
        </Section>
      )}
      {page === 'certificate' && <HubCertificate tenantId={id} canEdit={canIntegrate} />}
      {page === 'webhooks' && <HubWebhooks tenantId={id} canEdit={canIntegrate} />}
      {page === 'users' && (
        <Section title="Usuários de integração" text="Controlam os terminais desta empresa e usam a API de envio.">
          <Stack spacing={2}>
            <Grid
              heads={['Nome', 'E-mail', 'Papel', 'Situação', 'Criado']}
              rows={users.map(u => [
                u.nome,
                u.email,
                u.papel,
                <Chip
                  key="s"
                  size="small"
                  color={u.ativo ? 'success' : 'default'}
                  label={u.ativo ? 'ativo' : 'inativo'}
                />,
                when(u.criado_em)
              ])}
            />
            {canIntegrate && (
              <>
                <Typography variant="subtitle2">Novo usuário</Typography>
                <ActionForm
                  button="Criar usuário"
                  icon={AddIcon}
                  run={newUser}
                  fields={[
                    { name: 'nome', label: 'Nome', required: true },
                    { name: 'email', label: 'E-mail', type: 'email', required: true },
                    { name: 'senha', label: 'Senha (mín. 10)', type: 'password', required: true }
                  ]}
                />
              </>
            )}
          </Stack>
        </Section>
      )}
      {page === 'main' && (
        <>
          <Section
            title="Conexão e atividade"
            action={
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                <FormControlLabel
                  control={<Switch checked={auto} onChange={e => setAuto(e.target.checked)} />}
                  label="Atualizar a cada 10 s"
                />
                <IconAction title="Dados sincronizados" icon={StorageIcon} onClick={() => open('dados')} />
                <IconAction title="Log de requisições" icon={ReceiptLongIcon} onClick={() => open('logs')} />
              </Box>
            }
          >
            {agrosys && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                <Typography variant="subtitle2">Destino (Agrosys):</Typography>
                {connection.erp.ultima ? (
                  <Typography variant="body2" color="text.secondary">
                    última chamada: {connection.erp.ultima.resultado} · {when(connection.erp.ultima.ocorrido_em)} ·{' '}
                    {connection.erp.chamadas_24h} chamada(s) e {connection.erp.erros_24h} erro(s) em 24 h
                  </Typography>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    nenhuma chamada ainda
                  </Typography>
                )}
              </Box>
            )}
            <Grid
              heads={['Terminal', 'Conexão', 'Último contato', 'Última busca', 'Último ERP', '24 h', '']}
              rows={connection.terminais.map(t => [
                <Box key="n" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {t.nome}
                  <TerminalEnvironment value={t.ambiente} />
                </Box>,
                <Chip
                  key="c"
                  size="small"
                  color={connectionColor[t.conexao]}
                  label={t.ativo ? connectionLabel[t.conexao] : 'desativado'}
                />,
                when(t.ultimo_contato),
                activity(t.ultima_busca),
                activity(t.ultima_chamada_erp),
                `${t.requisicoes_24h} req · ${t.erros_24h} erro(s)`,
                <Tooltip key="l" title="Log deste terminal">
                  <IconButton color="primary" onClick={() => open('logs', t.id)}>
                    <ReceiptLongIcon />
                  </IconButton>
                </Tooltip>
              ])}
            />
          </Section>

          {agrosys && (
            <Section
              title="Conexão com o Agrosys"
              text="Valores padrão da empresa. Cada terminal herda estes valores e pode sobrescrevê-los nos parâmetros do caixa."
            >
              <Defaults tenant={tenant} run={saveDefaults} />
            </Section>
          )}

          {agrosys && (
            <Section
              title="Sincronização com o Agrosys"
              text="O Hub busca o catálogo no ERP e grava só o que mudou; os terminais recebem a diferença."
              action={<ActionButton label="Sincronizar agora" icon={SyncIcon} run={syncNow} />}
            >
              <Grid
                heads={['Entidade', 'Última execução', 'Lidas', 'Alteradas', 'Situação']}
                rows={runs.map(x => [
                  <code key="e">{x.entidade}</code>,
                  `${when(x.iniciado_em)} · ${x.duracao_ms} ms`,
                  x.lidas,
                  x.mudadas,
                  x.erro ? (
                    <Chip key="s" size="small" color="error" label={x.erro.slice(0, 60)} />
                  ) : (
                    <Chip key="s" size="small" color="success" label="ok" />
                  )
                ])}
              />
            </Section>
          )}

          <Section
            title="Envios (nota, caixa, e-mail)"
            text={
              agrosys
                ? 'O Hub entrega ao Agrosys e repete sozinho quando há falha técnica. Recusas do ERP podem ser reenviadas aqui.'
                : 'O sistema do cliente recebe cada envio por webhook (menu do cliente > Webhooks) ou busca os pendentes em GET /v1/tenants/{empresa}/outbox e confirma com .../ack.'
            }
          >
            <Grid
              heads={['Tipo', 'Chave', 'Situação', 'Atualizado', 'Mensagem', '']}
              rows={sends.map(s => [
                s.tipo,
                <code key="k">{s.chave}</code>,
                <Chip
                  key="s"
                  size="small"
                  color={sendColor[s.status] ?? 'default'}
                  label={s.tentativas > 1 ? `${s.status} (${s.tentativas}x)` : s.status}
                />,
                when(s.atualizado_em),
                s.mensagem ?? '',
                s.status !== 'enviado' ? (
                  <ActionButton key="r" label="Reenviar" icon={ReplayIcon} run={() => resend(s)} />
                ) : (
                  ''
                )
              ])}
            />
          </Section>

          <Section
            title="Terminais (caixas)"
            action={
              canIntegrate && (
                <Tooltip title="Novo terminal">
                  <IconButton color="primary" aria-label="Novo terminal" onClick={() => setCreatingTerminal(true)}>
                    <AddIcon />
                  </IconButton>
                </Tooltip>
              )
            }
          >
            <Stack spacing={2}>
              <Grid
                heads={['Nome', 'Ambiente', 'Código no PDV', 'Último contato', 'Token', 'Ações']}
                rows={terminals.map(t => [
                  t.nome,
                  <TerminalEnvironment key="amb" value={t.ambiente} />,
                  t.codigo_legado ?? '—',
                  t.ultimo_contato ? when(t.ultimo_contato) : 'nunca',
                  t.ativo ? (
                    <code key="t">{t.token_prefixo ?? '—'}…</code>
                  ) : (
                    <Chip key="t" label="desativado" size="small" />
                  ),
                  <Box key="a" sx={{ display: 'inline-flex', gap: 1, alignItems: 'center' }}>
                    <Tooltip title="Parâmetros do caixa">
                      <IconButton color="primary" onClick={() => open('terminais', t.id)}>
                        <TuneIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Editar terminal (nome, código, ambiente)">
                      <IconButton color="primary" onClick={() => setEditing(t)}>
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Replicar terminal">
                      <IconButton color="primary" onClick={() => setReplicating(t)}>
                        <ContentCopyIcon />
                      </IconButton>
                    </Tooltip>
                    <ActionButton
                      label="Novo token"
                      icon={VpnKeyIcon}
                      confirm="Gerar um novo token? O anterior deixa de funcionar na hora."
                      run={() => newToken(t)}
                    />
                    <Tooltip title="Excluir terminal">
                      <IconButton
                        color="error"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Excluir ${t.nome}? O token deixa de funcionar na hora e os parâmetros configurados para este caixa serão apagados. Esta ação não pode ser desfeita.`
                            )
                          )
                            removeTerminal(t);
                        }}
                      >
                        <DeleteOutlineIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>
                ])}
              />
            </Stack>
          </Section>
        </>
      )}
      <Dialog open={creatingTerminal} onClose={() => setCreatingTerminal(false)} fullWidth maxWidth="sm">
        <DialogTitle>Novo terminal</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <ActionForm
              button="Criar terminal"
              icon={AddIcon}
              run={async values => {
                const result = await newTerminal(values);
                if (!result.error) setCreatingTerminal(false);
                return result;
              }}
              fields={[
                { name: 'nome', label: 'Nome do caixa', required: true, placeholder: 'Caixa 01' },
                { name: 'codigoLegado', label: 'Código no PDV (cai_codigo)' },
                {
                  name: 'ambiente',
                  label: 'Ambiente',
                  options: environments,
                  default: tenant.homologation ? 'homologacao' : 'producao',
                  disabled: tenant.homologation,
                  helperText: tenant.homologation
                    ? 'Cliente de homologação: só terminais de homologação.'
                    : 'Produção vende de verdade; homologação é para testes.'
                }
              ]}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreatingTerminal(false)}>Cancelar</Button>
        </DialogActions>
      </Dialog>
      <EditDialog
        key={editing?.id}
        terminal={editing}
        forceHomologation={Boolean(tenant.homologation)}
        close={() => setEditing(null)}
        run={editTerminal}
      />
      <ReplicateDialog
        key={replicating?.id}
        terminal={replicating}
        forceHomologation={Boolean(tenant.homologation)}
        close={() => setReplicating(null)}
        run={replicate}
      />
      {!connection.terminais.length && !terminals.length && (
        <Alert severity="info">Este cliente ainda não tem terminais: crie o primeiro em “Novo terminal”.</Alert>
      )}
    </Stack>
  );
}
