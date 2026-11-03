import {
  Box, Button, Chip, IconButton, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, ReceiptLong as ReceiptLongIcon, Tune as TuneIcon } from '@mui/icons-material';
import { api } from '@/lib/api';
import { BotaoAcao, Formulario } from '@/components/Formulario';
import { PadroesEmpresa } from '@/components/EmpresaForm';
import { ExcluirTerminal } from '@/components/ExcluirTerminal';
import { ReplicarTerminal } from '@/components/ReplicarTerminal';
import {
  criarChaveApi, criarTerminal, criarUsuarioIntegracao, excluirTerminal, revogarChaveApi, gerarTokenTerminal, reenviarEnvio, replicarTerminal, salvarPadroes, sincronizarAgora,
} from '../actions';

type Tenant = {
  id: string; nome: string; documento: string | null; origem: 'agrosys' | 'api';
  padroes: Record<string, string | number | boolean | null>;
};
type Terminal = { id: string; nome: string; codigo_legado: string | null; ativo: boolean; ultimo_contato: string | null; token_prefixo: string | null };
type Execucao = { entidade: string; origem: string; iniciado_em: string; duracao_ms: number; lidas: number; mudadas: number; erro: string | null };
type Envio = { id: number; tipo: string; chave: string; status: string; tentativas: number; mensagem: string | null; atualizado_em: string };

type UltimaBusca = { ocorrido_em: string; operacao: string | null; resultado: string; itens?: number | null; mensagem: string | null };
type Conexao = {
  terminais: {
    id: string; nome: string; ativo: boolean; ultimo_contato: string | null; conexao: 'online' | 'recente' | 'offline' | 'nunca';
    requisicoes_24h: number; erros_24h: number; ultima_busca: UltimaBusca | null; ultima_chamada_erp: UltimaBusca | null;
  }[];
  erp: { ultima: UltimaBusca | null; chamadas_24h: number; erros_24h: number };
};

const corConexao = { online: 'success', recente: 'warning', offline: 'error', nunca: 'default' } as const;
const rotuloConexao = { online: 'online', recente: 'visto há pouco', offline: 'offline', nunca: 'nunca conectou' } as const;
const corResultado = (r: string) => (r === 'ok' ? 'success' : r === 'erro' ? 'error' : 'warning') as 'success' | 'error' | 'warning';
type ApiKey = { id: string; nome: string; prefixo: string; criado_em: string; ultimo_uso: string | null };
const secao = { p: { xs: 2, md: 3 } };
const corStatus: Record<string, 'default' | 'success' | 'warning' | 'error'> = { enviado: 'success', pendente: 'warning', recusado: 'error', erro: 'error' };
const data = (s: string) => new Date(s).toLocaleString('pt-BR');

export default async function TenantPagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [tenant, terminais, execucoes, envios, conexao] = await Promise.all([
    api<Tenant>(`/v1/tenants/${id}`),
    api<Terminal[]>(`/v1/tenants/${id}/terminals`),
    api<Execucao[]>(`/v1/tenants/${id}/sync-status`),
    api<Envio[]>(`/v1/tenants/${id}/outbox/resumo`),
    api<Conexao>(`/v1/tenants/${id}/conexao`),
  ]);
  const agrosys = tenant.origem === 'agrosys';
  const chaves = agrosys ? [] : await api<ApiKey[]>(`/v1/tenants/${id}/api-keys`);

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Tooltip title="Empresas"><IconButton href="/tenants" color="primary"><ArrowBackIcon /></IconButton></Tooltip>
        <Typography variant="h4" component="h1">{tenant.nome}</Typography>
        <Chip label={`Origem: ${agrosys ? 'Agrosys' : 'API'}`} />
        {tenant.documento && <Typography color="text.secondary">{tenant.documento}</Typography>}
      </Box>

      <Paper sx={secao}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          <Box>
            <Typography variant="h6">Conexão e atividade</Typography>
            <Typography variant="body2" color="text.secondary">
              Online = contato nos últimos 5 min (o Integrador avisa a cada ~2 min). “Última busca” é a última consulta de catálogo do terminal;
              “Último ERP” é a última chamada do Hub ao {agrosys ? 'Agrosys' : 'destino'} por causa dele.
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button href={`/tenants/${id}/logs`} variant="outlined" startIcon={<ReceiptLongIcon />}>Log de requisições</Button>
          </Box>
        </Box>
        {agrosys && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            <Typography variant="subtitle2">Destino (Agrosys):</Typography>
            {conexao.erp.ultima
              ? <>
                  <Chip size="small" color={corResultado(conexao.erp.ultima.resultado)} label={`última chamada: ${conexao.erp.ultima.resultado}`} />
                  <Typography variant="body2" color="text.secondary">
                    {data(conexao.erp.ultima.ocorrido_em)} · {conexao.erp.chamadas_24h} chamada(s) e {conexao.erp.erros_24h} erro(s) em 24 h
                    {conexao.erp.ultima.mensagem && conexao.erp.ultima.resultado !== 'ok' ? ` · ${conexao.erp.ultima.mensagem}` : ''}
                  </Typography>
                </>
              : <Typography variant="body2" color="text.secondary">nenhuma chamada ainda</Typography>}
          </Box>
        )}
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Terminal</TableCell><TableCell>Conexão</TableCell><TableCell>Último contato</TableCell>
              <TableCell>Última busca</TableCell><TableCell>Último ERP</TableCell>
              <TableCell align="right">24 h</TableCell><TableCell align="right"> </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {conexao.terminais.map((t) => (
              <TableRow key={t.id} hover>
                <TableCell>{t.nome}</TableCell>
                <TableCell><Chip size="small" color={corConexao[t.conexao]} label={t.ativo ? rotuloConexao[t.conexao] : 'desativado'} /></TableCell>
                <TableCell>{t.ultimo_contato ? data(t.ultimo_contato) : '—'}</TableCell>
                <TableCell>
                  {t.ultima_busca
                    ? <><Chip size="small" color={corResultado(t.ultima_busca.resultado)} label={t.ultima_busca.operacao ?? 'sync'} /> <Typography component="span" variant="caption" color="text.secondary">{data(t.ultima_busca.ocorrido_em)}</Typography></>
                    : '—'}
                </TableCell>
                <TableCell>
                  {t.ultima_chamada_erp
                    ? <><Chip size="small" color={corResultado(t.ultima_chamada_erp.resultado)} label={t.ultima_chamada_erp.operacao ?? 'ERP'} /> <Typography component="span" variant="caption" color="text.secondary">{data(t.ultima_chamada_erp.ocorrido_em)}</Typography></>
                    : '—'}
                </TableCell>
                <TableCell align="right">{t.requisicoes_24h} req · {t.erros_24h > 0 ? <strong style={{ color: '#d92d20' }}>{t.erros_24h} erro(s)</strong> : '0 erros'}</TableCell>
                <TableCell align="right">
                  <Tooltip title="Log deste terminal"><IconButton href={`/tenants/${id}/logs?terminal=${t.id}`} color="primary"><ReceiptLongIcon /></IconButton></Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {conexao.terminais.length === 0 && (
              <TableRow><TableCell colSpan={7}><Typography color="text.secondary">Nenhum terminal.</Typography></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      {agrosys && (
        <Paper sx={secao}>
          <Typography variant="h6" mb={0.5}>Conexão com o Agrosys</Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Valores padrão da empresa. Cada terminal herda estes valores e pode sobrescrevê-los nos parâmetros do caixa.
          </Typography>
          <PadroesEmpresa acao={salvarPadroes.bind(null, id)} padroes={tenant.padroes} />
        </Paper>
      )}

      {agrosys && (
        <Paper sx={secao}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2 }}>
            <Box>
              <Typography variant="h6">Sincronização com o Agrosys</Typography>
              <Typography variant="body2" color="text.secondary">
                O Hub busca o catálogo no ERP e grava só o que mudou; os terminais recebem a diferença.
              </Typography>
            </Box>
            <BotaoAcao rotulo="Sincronizar agora" acao={sincronizarAgora.bind(null, id)} />
          </Box>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Entidade</TableCell><TableCell>Última execução</TableCell>
                <TableCell align="right">Lidas</TableCell><TableCell align="right">Alteradas</TableCell><TableCell>Situação</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {execucoes.map((x) => (
                <TableRow key={x.entidade} hover>
                  <TableCell><code>{x.entidade}</code></TableCell>
                  <TableCell>{data(x.iniciado_em)} · {x.duracao_ms} ms</TableCell>
                  <TableCell align="right">{x.lidas}</TableCell>
                  <TableCell align="right">{x.mudadas}</TableCell>
                  <TableCell>
                    {x.erro ? <Chip size="small" color="error" label={x.erro.slice(0, 60)} /> : <Chip size="small" color="success" label="ok" />}
                  </TableCell>
                </TableRow>
              ))}
              {execucoes.length === 0 && (
                <TableRow><TableCell colSpan={5}><Typography color="text.secondary">Nenhuma sincronização ainda.</Typography></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>
      )}

      {!agrosys && (
        <Paper sx={secao}>
          <Typography variant="h6" mb={0.5}>Chaves de API</Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            O sistema do cliente envia os cadastros com <code>POST /v1/&#123;recurso&#125;</code> e uma destas chaves (veja a <a href="/docs">Documentação</a>).
          </Typography>
          <Table size="small" sx={{ mb: 2 }}>
            <TableHead>
              <TableRow><TableCell>Nome</TableCell><TableCell>Chave</TableCell><TableCell>Criada</TableCell><TableCell>Último uso</TableCell><TableCell align="right"> </TableCell></TableRow>
            </TableHead>
            <TableBody>
              {chaves.map((k) => (
                <TableRow key={k.id} hover>
                  <TableCell>{k.nome}</TableCell>
                  <TableCell><code>{k.prefixo}…</code></TableCell>
                  <TableCell>{data(k.criado_em)}</TableCell>
                  <TableCell>{k.ultimo_uso ? data(k.ultimo_uso) : 'nunca'}</TableCell>
                  <TableCell align="right"><BotaoAcao rotulo="Revogar" acao={revogarChaveApi.bind(null, id, k.id)} /></TableCell>
                </TableRow>
              ))}
              {chaves.length === 0 && <TableRow><TableCell colSpan={5}><Typography color="text.secondary">Nenhuma chave.</Typography></TableCell></TableRow>}
            </TableBody>
          </Table>
          <Formulario acao={criarChaveApi.bind(null, id)} botao="Criar chave" campos={[{ name: 'nome', label: 'Nome da chave', required: true, placeholder: 'ERP do cliente' }]} />
        </Paper>
      )}

      <Paper sx={secao}>
        <Typography variant="h6" mb={0.5}>Envios (nota, caixa, e-mail)</Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          {agrosys
            ? 'O Hub entrega ao Agrosys e repete sozinho quando há falha técnica. Recusas do ERP podem ser reenviadas aqui.'
            : 'O sistema do cliente busca os pendentes em GET /v1/tenants/{empresa}/outbox e confirma com .../ack.'}
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Tipo</TableCell><TableCell>Chave</TableCell><TableCell>Situação</TableCell>
              <TableCell>Atualizado</TableCell><TableCell>Mensagem</TableCell><TableCell align="right"> </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {envios.map((e) => (
              <TableRow key={e.id} hover>
                <TableCell>{e.tipo}</TableCell>
                <TableCell><code>{e.chave}</code></TableCell>
                <TableCell>
                  <Chip size="small" color={corStatus[e.status] ?? 'default'} label={e.tentativas > 1 ? `${e.status} (${e.tentativas}x)` : e.status} />
                </TableCell>
                <TableCell>{data(e.atualizado_em)}</TableCell>
                <TableCell sx={{ maxWidth: 320 }}>{e.mensagem ?? ''}</TableCell>
                <TableCell align="right">
                  {e.status !== 'enviado' && <BotaoAcao rotulo="Reenviar" acao={reenviarEnvio.bind(null, id, e.id)} />}
                </TableCell>
              </TableRow>
            ))}
            {envios.length === 0 && (
              <TableRow><TableCell colSpan={6}><Typography color="text.secondary">Nenhum envio ainda.</Typography></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      <Paper sx={secao}>
        <Typography variant="h6" mb={2}>Terminais (caixas)</Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Nome</TableCell><TableCell>Código no PDV</TableCell><TableCell>Último contato</TableCell>
              <TableCell>Token</TableCell><TableCell align="right">Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {terminais.map((t) => (
              <TableRow key={t.id} hover>
                <TableCell>{t.nome}</TableCell>
                <TableCell>{t.codigo_legado ?? '—'}</TableCell>
                <TableCell>{t.ultimo_contato ? data(t.ultimo_contato) : 'nunca'}</TableCell>
                <TableCell>{t.ativo ? <code>{t.token_prefixo ?? '—'}…</code> : <Chip label="desativado" size="small" />}</TableCell>
                <TableCell align="right">
                  <Box sx={{ display: 'inline-flex', gap: 1, alignItems: 'flex-start' }}>
                    <Tooltip title="Parâmetros do caixa">
                      <IconButton href={`/tenants/${id}/terminais/${t.id}`} color="primary"><TuneIcon /></IconButton>
                    </Tooltip>
                    <ReplicarTerminal nome={t.nome} acao={replicarTerminal.bind(null, id, t.id)} />
                    <BotaoAcao rotulo="Novo token" acao={gerarTokenTerminal.bind(null, id, t.id)} />
                    <ExcluirTerminal nome={t.nome} acao={excluirTerminal.bind(null, id, t.id)} />
                  </Box>
                </TableCell>
              </TableRow>
            ))}
            {terminais.length === 0 && (
              <TableRow><TableCell colSpan={5}><Typography color="text.secondary">Nenhum terminal.</Typography></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      <Paper sx={secao}>
        <Typography variant="h6" mb={2}>Novo terminal</Typography>
        <Formulario acao={criarTerminal.bind(null, id)} botao="Criar terminal" campos={[
          { name: 'nome', label: 'Nome do caixa', required: true, placeholder: 'Caixa 01' },
          { name: 'codigoLegado', label: 'Código no PDV (cai_codigo)' },
        ]} />
      </Paper>

      <Paper sx={secao}>
        <Typography variant="h6" mb={0.5}>Usuário de integração</Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>Controla os terminais desta empresa e usa a API de envio.</Typography>
        <Formulario acao={criarUsuarioIntegracao.bind(null, id)} botao="Criar usuário" campos={[
          { name: 'nome', label: 'Nome', required: true },
          { name: 'email', label: 'E-mail', type: 'email', required: true },
          { name: 'senha', label: 'Senha (mín. 10)', type: 'password', required: true },
        ]} />
      </Paper>
    </Stack>
  );
}
