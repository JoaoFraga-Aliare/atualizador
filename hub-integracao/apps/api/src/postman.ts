// Collection do Postman com TODAS as operacoes da API do Hub, montada a partir dos contratos reais (nunca fica desatualizada).
// Servida em GET /v1/postman/collection (e /environment), baixada na Documentacao do painel, e gravada em docs/hub/postman
// por `npm run postman`.
// Toda requisicao leva o cabecalho  Referer: postman  : o Hub grava o que ela envia como TESTE e nao conta no
// calculo de homologacao (checklist de prontidao).
import { contratos } from '@hub/contracts';

type Item = Record<string, unknown>;
type Pasta = { name: string; description?: string; item: unknown[]; auth?: unknown };

const REFERER = { key: 'Referer', value: 'postman', description: 'Identifica o Postman: o Hub trata o que for enviado como teste (nao conta na homologacao).' };
const bearer = (variavel: string) => ({ type: 'bearer', bearer: [{ key: 'token', value: `{{${variavel}}}`, type: 'string' }] });
const semAuth = { type: 'noauth' };

const url = (caminho: string, query: [string, string, string?][] = []) => {
  const partes = caminho.replace(/^\//, '').split('/');
  return {
    raw: `{{baseUrl}}/${caminho.replace(/^\//, '')}${query.length ? '?' + query.map(([k, v]) => `${k}=${v}`).join('&') : ''}`,
    host: ['{{baseUrl}}'], path: partes,
    ...(query.length ? { query: query.map(([key, value, description]) => ({ key, value, ...(description ? { description } : {}) })) } : {}),
  };
};

function req(nome: string, metodo: string, caminho: string, opcoes: { corpo?: unknown; query?: [string, string, string?][]; descricao?: string; teste?: string; auth?: unknown; cabecalhos?: { key: string; value: string }[] } = {}): Item {
  const headers: unknown[] = [REFERER, ...(opcoes.cabecalhos ?? [])];
  if (opcoes.corpo !== undefined) headers.push({ key: 'Content-Type', value: 'application/json' });
  return {
    name: nome,
    ...(opcoes.teste ? { event: [{ listen: 'test', script: { type: 'text/javascript', exec: opcoes.teste.split('\n') } }] } : {}),
    request: {
      method: metodo,
      header: headers,
      ...(opcoes.auth ? { auth: opcoes.auth } : {}),
      ...(opcoes.corpo !== undefined ? { body: { mode: 'raw', raw: JSON.stringify(opcoes.corpo, null, 2), options: { raw: { language: 'json' } } } } : {}),
      url: url(caminho, opcoes.query),
      ...(opcoes.descricao ? { description: opcoes.descricao } : {}),
    },
  };
}

const guarda = (variavel: string, expressao: string) =>
  `const j = pm.response.json();\nconst v = ${expressao};\nif (v) pm.collectionVariables.set('${variavel}', v);`;

// ---------------------------------------------------------------------------------------------------------------
// 1. API do sistema do cliente (chave de API): um grupo por contrato
// ---------------------------------------------------------------------------------------------------------------
const cadastros: Pasta[] = contratos.map((c) => {
  const base = `v1/${c.caminho}`;
  const exemplo = c.exemplo;
  const primeiro = Object.entries(exemplo).find(([k]) => !c.campos.find((f) => f.nome === k)?.obrigatorio) ?? Object.entries(exemplo)[0];
  return {
    name: c.titulo,
    description: `${c.descricao}${c.observacao ? `\n\n${c.observacao}` : ''}\n\nCaminho: \`/${base}\`. Veja os campos em Documentação > Recursos no painel.`,
    item: [
      req('Enviar (criar ou atualizar)', 'POST', base, { corpo: exemplo, descricao: 'Um registro. A chave do registro decide se cria ou atualiza; reenviar o mesmo conteudo e seguro (situacao: inalterado).', teste: guarda('recordId', 'j.registros && j.registros[0] && j.registros[0].id') }),
      req('Enviar em lote', 'POST', base, { corpo: [exemplo, exemplo], descricao: 'Lista de ate 5000 registros. Se um for invalido, nenhum e gravado.' }),
      req('Listar', 'GET', base, { query: [['limite', '100', 'ate 500'], ['depois', '0', 'cursor: use o "proximo" da resposta anterior']] }),
      req('Consultar por id', 'GET', `${base}/{{recordId}}`),
      req('Alterar campos (PATCH)', 'PATCH', `${base}/{{recordId}}`, { corpo: { [primeiro[0]]: primeiro[1] }, descricao: 'So os campos enviados mudam. A chave do registro nao pode ser alterada.' }),
      req('Pausar', 'POST', `${base}/{{recordId}}/pause`, { corpo: {}, descricao: 'O registro continua salvo, mas some dos terminais.' }),
      req('Retomar', 'POST', `${base}/{{recordId}}/resume`, { corpo: {} }),
      req('Remover', 'DELETE', `${base}/{{recordId}}`, { descricao: 'O terminal recebe a exclusao no proximo sync.' }),
    ],
  };
});

const terminalCompleto = {
  codigo: '01', nome: 'Caixa 01', ambiente: 'homologacao',
  empresa: { razaoSocial: 'Loja X LTDA', nomeFantasia: 'Loja X', cnpj: '12345678000190', inscricaoEstadual: '131234567', telefone: '6599999999', cep: '78700000', endereco: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'RONDONOPOLIS', uf: 'MT', codigoCidade: 5107602 },
  fiscal: { serieNfce: '1', ultimaNfce: 0, serieNfe: '1', ultimaNfe: 0, csc: 'ABC123', idCsc: '000001', operacao: 1, consumidorFinal: 1 },
  parametros: { cai_loja: 1 },
  certificado: { pfx: '<arquivo .pfx em base64>', senha: 'senha-do-certificado', nome: 'loja.pfx' },
};

const terminaisApi: Pasta = {
  name: 'Terminais (caixas)',
  description: 'Cadastra o terminal inteiro: empresa, fiscal, parametros e certificado. O token aparece so na criacao.',
  item: [
    req('Criar ou atualizar terminal', 'POST', 'v1/terminals', { corpo: terminalCompleto, descricao: 'Mesmo "codigo" = mesmo terminal: so o que vier muda. O token (tk_...) so volta na criacao.', teste: `const j = pm.response.json();\nif (j.id) pm.collectionVariables.set('terminalId', j.id);\nif (j.token) pm.collectionVariables.set('terminalToken', j.token);` }),
    req('Listar terminais', 'GET', 'v1/terminals'),
    req('Consultar terminal', 'GET', 'v1/terminals/{{terminalId}}'),
    req('Alterar terminal (PATCH)', 'PATCH', 'v1/terminals/{{terminalId}}', { corpo: { fiscal: { serieNfce: '2' } } }),
    req('Gerar novo token', 'POST', 'v1/terminals/{{terminalId}}/token', { corpo: {}, descricao: 'O token anterior deixa de valer na hora.', teste: `const j = pm.response.json();\nif (j.token) pm.collectionVariables.set('terminalToken', j.token);` }),
    req('Excluir terminal', 'DELETE', 'v1/terminals/{{terminalId}}'),
    req('Numeração em lote (ERP atualiza série e último número)', 'POST', 'v1/terminals/numeracao', {
      corpo: [{ codigo: '01', serieNfce: '1', ultimaNfce: 1520, serieNfe: '1', ultimaNfe: 87 }],
      descricao: 'O numero so sobe (menor ou igual ao do Hub e ignorado). Serie nova vale. forcarNumeracao:true permite voltar.',
    }),
  ],
};

const certificadoApi: Pasta = {
  name: 'Certificado digital (empresa)',
  item: [
    req('Enviar certificado A1', 'PUT', 'v1/certificado', { corpo: { pfx: '<arquivo .pfx em base64>', senha: 'senha-do-certificado', nome: 'loja.pfx' }, descricao: 'Vale para todos os terminais da empresa. Guardado cifrado.' }),
    req('Consultar certificado', 'GET', 'v1/certificado', { descricao: 'So metadados: o arquivo e a senha nunca voltam.' }),
    req('Remover certificado', 'DELETE', 'v1/certificado'),
  ],
};

const apiCliente: Pasta = {
  name: '1. API do sistema do cliente (chave de API)',
  description: 'Usa a chave hk_ da empresa (variavel apiKey). Enviam-se cadastros, terminais e certificado.',
  auth: bearer('apiKey'),
  item: [{ name: 'Cadastros', description: 'Um grupo por recurso do contrato externo.', item: cadastros }, terminaisApi, certificadoApi],
};

// ---------------------------------------------------------------------------------------------------------------
// 2. Gerencial (usuario do Hub, JWT)
// ---------------------------------------------------------------------------------------------------------------
const T = '{{tenantId}}';
const gerencial: Pasta = {
  name: '2. Gerencial (usuário do Hub — JWT)',
  description: 'Faca o Login primeiro: o token (jwt) e guardado sozinho. Rotas do painel; as de administrador exigem usuario super.',
  auth: bearer('jwt'),
  item: [
    { name: 'Sessão e consulta', item: [
      { ...req('Login', 'POST', 'v1/auth/login', { corpo: { email: '{{email}}', senha: '{{senha}}' }, auth: semAuth, teste: guarda('jwt', 'j.token') }) },
      req('Quem sou eu (empresas)', 'GET', 'v1/me', { teste: guarda('tenantId', 'j.tenants && j.tenants[0] && j.tenants[0].id') }),
      req('Documentação (contratos)', 'GET', 'v1/docs'),
      req('Catálogo de entidades', 'GET', 'v1/catalog', { auth: semAuth }),
      req('Parâmetros do caixa (catálogo)', 'GET', 'v1/parametros', { query: [['origem', 'api', 'api ou agrosys']] }),
      req('Cidades', 'GET', 'v1/cidades', { query: [['busca', 'rondon'], ['uf', 'MT'], ['pagina', '0']] }),
      req('Cidades: carregar do IBGE (admin)', 'POST', 'v1/cidades/ibge/carregar', { corpo: {} }),
      req('Cidades: editar (admin)', 'PATCH', 'v1/cidades/{{cidadeCodigo}}', { corpo: { populacao: 244911 } }),
      req('Saúde do Hub', 'GET', 'health', { auth: semAuth }),
    ] },
    { name: 'Empresas (admin)', item: [
      req('Criar empresa (origem API)', 'POST', 'v1/tenants', { corpo: { nome: 'Cliente Exemplo', documento: '12345678000190', origem: 'api' }, teste: guarda('tenantId', 'j.id') }),
      req('Criar empresa (origem Agrosys)', 'POST', 'v1/tenants', { corpo: { nome: 'Cliente Agrosys', origem: 'agrosys', padroes: { con_sincurl: 'http://servidor:9080', emp_empresa: 1, uni_unidade: 1, fil_filial: 1 } } }),
      req('Consultar empresa', 'GET', `v1/tenants/${T}`),
      req('Padrões de conexão (Agrosys)', 'PUT', `v1/tenants/${T}/padroes`, { corpo: { padroes: { cai_timeout: 5000 } } }),
      req('Excluir empresa (só se nunca conectou terminal)', 'DELETE', `v1/tenants/${T}`),
      req('Resumo (players, tráfego 24 h)', 'GET', 'v1/resumo'),
    ] },
    { name: 'Usuários da empresa', item: [
      req('Listar usuários', 'GET', `v1/tenants/${T}/users`),
      req('Criar usuário de integração', 'POST', `v1/tenants/${T}/users`, { corpo: { email: 'integracao@cliente.com', nome: 'Integração', senha: 'uma-senha-longa-123', papel: 'integracao' } }),
    ] },
    { name: 'Terminais da empresa', item: [
      req('Listar terminais', 'GET', `v1/tenants/${T}/terminals`, { teste: guarda('terminalId', 'j[0] && j[0].id') }),
      req('Criar terminal (produção ou homologação)', 'POST', `v1/tenants/${T}/terminals`, { corpo: { nome: 'Caixa 01', codigoLegado: '01', ambiente: 'homologacao' }, teste: `const j = pm.response.json();\nif (j.id) pm.collectionVariables.set('terminalId', j.id);\nif (j.token) pm.collectionVariables.set('terminalToken', j.token);` }),
      req('Replicar terminal', 'POST', `v1/tenants/${T}/terminals`, { corpo: { nome: 'Caixa 02', codigoLegado: '02', copiarDe: '{{terminalId}}' } }),
      req('Gerar novo token', 'POST', `v1/tenants/${T}/terminals/{{terminalId}}/token`, { corpo: {}, teste: `const j = pm.response.json();\nif (j.token) pm.collectionVariables.set('terminalToken', j.token);` }),
      req('Desativar terminal', 'POST', `v1/tenants/${T}/terminals/{{terminalId}}/desativar`, { corpo: {} }),
      req('Excluir terminal', 'DELETE', `v1/tenants/${T}/terminals/{{terminalId}}`),
      req('Parâmetros do caixa: consultar', 'GET', `v1/tenants/${T}/terminals/{{terminalId}}/config`),
      req('Parâmetros do caixa: alterar', 'PUT', `v1/tenants/${T}/terminals/{{terminalId}}/config`, { corpo: { valores: { cai_loja: 1, cai_nomeloja: 'Loja X' } } }),
      req('Trazer parâmetros do Agrosys (prévia)', 'POST', `v1/tenants/${T}/terminals/{{terminalId}}/config/agrosys`, { corpo: { aplicar: false } }),
      req('Trazer parâmetros do Agrosys (aplicar)', 'POST', `v1/tenants/${T}/terminals/{{terminalId}}/config/agrosys`, { corpo: { aplicar: true } }),
    ] },
    { name: 'Chaves de API', item: [
      req('Listar chaves', 'GET', `v1/tenants/${T}/api-keys`),
      req('Criar chave (aparece só agora)', 'POST', `v1/tenants/${T}/api-keys`, { corpo: { nome: 'ERP' }, teste: guarda('apiKey', 'j.chave') }),
      req('Revogar chave', 'DELETE', `v1/tenants/${T}/api-keys/{{chaveId}}`),
    ] },
    { name: 'Webhooks', item: [
      req('Listar webhooks', 'GET', `v1/tenants/${T}/webhooks`, { teste: guarda('webhookId', 'j.webhooks && j.webhooks[0] && j.webhooks[0].id') }),
      req('Criar webhook', 'POST', `v1/tenants/${T}/webhooks`, { corpo: { nome: 'ERP', url: 'https://meuerp.com/hub/webhook', eventos: ['nota', 'movimento-caixa', 'email'] }, teste: guarda('webhookId', 'j.id') }),
      req('Alterar webhook', 'PATCH', `v1/tenants/${T}/webhooks/{{webhookId}}`, { corpo: { eventos: ['nota'] } }),
      req('Novo segredo', 'POST', `v1/tenants/${T}/webhooks/{{webhookId}}/segredo`, { corpo: {} }),
      req('Enviar teste (ping)', 'POST', `v1/tenants/${T}/webhooks/{{webhookId}}/testar`, { corpo: {} }),
      req('Entregas', 'GET', `v1/tenants/${T}/webhooks/entregas`),
      req('Detalhe da entrega', 'GET', `v1/tenants/${T}/webhooks/entregas/{{entregaId}}`),
      req('Reenviar entrega', 'POST', `v1/tenants/${T}/webhooks/entregas/{{entregaId}}/reenviar`, { corpo: {} }),
      req('Excluir webhook', 'DELETE', `v1/tenants/${T}/webhooks/{{webhookId}}`),
    ] },
    { name: 'Envios do PDV (outbox)', item: [
      req('Resumo', 'GET', `v1/tenants/${T}/outbox/resumo`),
      req('Listar pendentes', 'GET', `v1/tenants/${T}/outbox`, { query: [['status', 'pendente']], teste: guarda('outboxId', 'j[0] && j[0].id') }),
      req('Confirmar (ack)', 'POST', `v1/tenants/${T}/outbox/{{outboxId}}/ack`, { corpo: { ok: true, mensagem: 'Nota integrada.' } }),
      req('Reenviar', 'POST', `v1/tenants/${T}/outbox/{{outboxId}}/reenviar`, { corpo: {} }),
    ] },
    { name: 'Dados, sincronização e certificado', item: [
      req('Espelho: entidades', 'GET', `v1/tenants/${T}/espelho`),
      req('Espelho: linhas de uma entidade', 'GET', `v1/tenants/${T}/espelho/{{entidade}}`, { query: [['busca', ''], ['limite', '50'], ['pagina', '0']] }),
      req('Sincronizar com o Agrosys', 'POST', `v1/tenants/${T}/sync`, { corpo: {} }),
      req('Status da sincronização', 'GET', `v1/tenants/${T}/sync-status`),
      req('Ingestão em lote (gerencial)', 'POST', `v1/tenants/${T}/ingest/{{entidade}}`, { corpo: { linhas: [] } }),
      req('Certificado: enviar', 'PUT', `v1/tenants/${T}/certificado`, { corpo: { pfx: '<arquivo .pfx em base64>', senha: 'senha-do-certificado', nome: 'loja.pfx' } }),
      req('Certificado: consultar', 'GET', `v1/tenants/${T}/certificado`),
      req('Certificado: acessos', 'GET', `v1/tenants/${T}/certificado/acessos`),
      req('Certificado: remover', 'DELETE', `v1/tenants/${T}/certificado`),
    ] },
    { name: 'Homologação, conexão e logs', item: [
      req('Prontidão (checklist de homologação)', 'GET', `v1/tenants/${T}/prontidao`, { descricao: 'Dados enviados com Referer: postman aparecem como "de teste" e nao contam.' }),
      req('Conexão dos terminais', 'GET', `v1/tenants/${T}/conexao`),
      req('Log de requisições', 'GET', `v1/tenants/${T}/logs`, { query: [['resultado', 'falha', 'ok, recusado, erro ou falha (erro + recusado)'], ['canal', 'terminal->hub'], ['ocultarVazias', '1']], teste: guarda('logId', 'j[0] && j[0].id') }),
      req('Detalhe de uma requisição', 'GET', `v1/tenants/${T}/logs/{{logId}}`),
    ] },
    { name: 'Logs do Hub (admin)', item: [
      req('Configuração: consultar', 'GET', 'v1/admin/logs/config'),
      req('Configuração: alterar', 'PUT', 'v1/admin/logs/config', { corpo: { diasLog: 30, horasCorpo: 6, notificar: { terminal_erro: true, erp_erro: true, terminal_recusado: false } } }),
      req('Limpar (corpos | sucesso | antigos | tudo)', 'POST', 'v1/admin/logs/limpar', { corpo: { alvo: 'antigos', dias: 30 } }),
      req('Notificações (erros das últimas 24 h)', 'GET', 'v1/admin/logs/notificacoes'),
    ] },
  ],
};

// ---------------------------------------------------------------------------------------------------------------
// 3. Terminal (token tk_)
// ---------------------------------------------------------------------------------------------------------------
const terminal: Pasta = {
  name: '3. Terminal (token do caixa)',
  description: 'O que o Integrador faz com o token tk_ do terminal (variavel terminalToken).',
  auth: bearer('terminalToken'),
  item: [
    req('Ping', 'POST', 'v1/terminal/ping', { corpo: {}, descricao: 'Devolve terminal, empresa, ambiente e as versoes de configuracao e certificado.' }),
    req('Configuração (parâmetros do caixa)', 'GET', 'v1/terminal/config', { query: [['desde', '0', 'versao ja conhecida: sem mudanca volta {mudou:false}']], descricao: 'con_tpamb vem do ambiente do terminal: 1 producao, 2 homologacao.' }),
    req('Certificado digital', 'GET', 'v1/terminal/certificado', { query: [['versao', '0']] }),
    req('Sincronizar uma entidade', 'GET', 'v1/sync/{{entidade}}', { query: [['desde', '0'], ['limite', '500']] }),
    req('Operação em tempo real', 'POST', 'v1/terminal/ops/{{operacao}}', { corpo: { quantidade: 0, parametros: { 'cli-codigo': 10 } }, descricao: 'PDVLOGIN, PDVVERSAO, PDVPEDIDO, PDVFECHAMENTO, PDVPENDFIN, PDVCANCNOTA, PDVSUPCAIXA, PDVSALDO, PDVCLIENTE, PDVFACLIUNI, PDVPRODUTO, PDVPRECO, PDVTRANSP, PDVSALLOTE.' }),
    req('Enviar nota', 'POST', 'v1/terminal/envios/nota', { corpo: { chave: '1:77', payload: { ds: { 'tt-nfscapa': [{ nfs_serie: '1', nfs_numero: 77 }] } } }, teste: guarda('envioId', 'j.id') }),
    req('Enviar movimento de caixa', 'POST', 'v1/terminal/envios/movimento-caixa', { corpo: { chave: '1001', payload: {} } }),
    req('Enviar e-mail', 'POST', 'v1/terminal/envios/email', { corpo: { chave: '1:77', payload: { serie: '1', numero: 77, usuario: 'caixa', destino: 'cliente@exemplo.com' } } }),
    req('Situação de um envio', 'GET', 'v1/terminal/envios/{{envioId}}'),
  ],
};

// ---------------------------------------------------------------------------------------------------------------
const descricao = `# Hub de Integração — API

**Todas as requisições desta collection enviam o cabecalho \`Referer: postman\`.** Com ele o Hub grava o que voce enviar
normalmente (cadastros, terminais, certificado), mas marca como **teste**: **nao conta no calculo de homologacao**
(o checklist mostra "N de teste do Postman ignorado(s)"). Para o dado valer, envie-o pelo seu sistema, sem o cabecalho.
Um envio do seu sistema sobre um registro criado pelo Postman passa a valer; o Postman nunca tira a marca de "valido".

## Como usar
1. Importe esta collection e o ambiente **Hub.postman_environment.json**.
2. Ajuste **baseUrl** (ex.: http://localhost:4000) e, conforme a pasta, **apiKey** (hk_...), **email/senha** (Login) ou **terminalToken** (tk_...).
3. Pasta 2: rode **Login** (guarda o jwt) e **Quem sou eu** (guarda o tenantId). Em **Chaves de API > Criar chave** o apiKey tambem e guardado.
4. Pasta 1: os cadastros guardam o **recordId** do ultimo registro enviado para Consultar, Alterar, Pausar, Retomar e Remover.
5. Pasta 3: **Criar terminal** guarda o **terminalToken**.

## Autenticacao
| Pasta | Credencial | Variavel |
|---|---|---|
| 1. API do sistema do cliente | chave de API da empresa | apiKey |
| 2. Gerencial | JWT do login | jwt |
| 3. Terminal | token do caixa | terminalToken |

Limites: o Hub responde 429 (Retry-After) ao passar dos limites de taxa; ao errar a senha repetidas vezes, o login e bloqueado por alguns minutos.
`;


const variaveis = (baseUrl: string): [string, string][] => [
  ['baseUrl', baseUrl], ['apiKey', ''], ['jwt', ''], ['terminalToken', ''],
  ['email', 'admin@hub.local'], ['senha', ''],
  ['tenantId', ''], ['terminalId', ''], ['recordId', ''], ['chaveId', ''], ['webhookId', ''], ['entregaId', ''], ['outboxId', ''], ['logId', ''],
  ['envioId', ''], ['entidade', 'brands'], ['operacao', 'PDVVERSAO'], ['cidadeCodigo', '1'],
];

export function montarColecao(baseUrl = 'http://localhost:4000') {
  const colecao = {
    info: {
      _postman_id: '6f2d8c1e-5a0b-4e8f-9d63-0a7b1c2d3e4f', name: 'Hub de Integração — API',
      description: descricao, schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    auth: bearer('apiKey'),
    // Garante o Referer mesmo se alguem criar uma requisicao nova na collection.
    event: [{ listen: 'prerequest', script: { type: 'text/javascript', exec: [
      '// Identifica o Postman para o Hub: o que for enviado e tratado como teste e nao conta na homologacao.',
      "pm.request.headers.upsert({ key: 'Referer', value: 'postman' });",
    ] } }],
    variable: variaveis(baseUrl).map(([key, value]) => ({ key, value, type: 'string' })),
    item: [apiCliente, gerencial, terminal] as Pasta[],
  };
  return colecao;
}

export function montarAmbiente(baseUrl = 'http://localhost:4000') {
  return {
    id: 'hub-ambiente', name: 'Hub', _postman_variable_scope: 'environment',
    values: ([['baseUrl', baseUrl, 'default'], ['apiKey', '', 'secret'], ['jwt', '', 'secret'], ['terminalToken', '', 'secret'], ['email', 'admin@hub.local', 'default'], ['senha', '', 'secret']] as [string, string, string][])
      .map(([key, value, type]) => ({ key, value, type, enabled: true })),
  };
}

export const totalDeRequisicoes = (itens: unknown[] = montarColecao().item): number =>
  itens.reduce<number>((soma, i) => soma + ((i as Pasta).item ? totalDeRequisicoes((i as Pasta).item) : 1), 0);
