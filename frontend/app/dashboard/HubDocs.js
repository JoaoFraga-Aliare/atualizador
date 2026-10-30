'use client';
import {
  Alert,
  Box,
  Chip,
  Link as MuiLink,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';

const typeLabel = c =>
  c.tipo === 'texto'
    ? `String${c.tamanho ? ` (até ${c.tamanho})` : ''}`
    : c.tipo === 'inteiro'
      ? 'Integer'
      : c.tipo === 'decimal'
        ? 'Decimal'
        : 'Date';
const expected = c =>
  c.valores ??
  (c.conversao
    ? '0 ou 1'
    : c.tipo === 'decimal'
      ? 'número, com ponto decimal'
      : c.tipo === 'inteiro'
        ? 'número inteiro'
        : '');
const json = o => JSON.stringify(o, null, 2);
const Code = ({ children }) => (
  <Paper variant="outlined" sx={{ mb: 1 }}>
    <Box component="pre" sx={{ m: 0, p: 1.5, fontSize: 13, overflow: 'auto' }}>
      {children}
    </Box>
  </Paper>
);
const section = { p: { xs: 2, md: 3 } };

export function Resource({ c, base }) {
  const url = `${base}/v1/${c.caminho}`,
    path = `/v1/${c.caminho}`,
    example = c.campos.find(f => !f.obrigatorio)?.nome ?? c.campos[0].nome;
  return (
    <Paper id={c.caminho} sx={section}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 0.5 }}>
        <Typography variant="h6" component="h2">
          {c.titulo}
        </Typography>
        <Chip size="small" color="primary" label="POST" />
      </Box>
      <Typography mb={1.5}>{c.descricao}</Typography>
      <Typography variant="body2" mb={2}>
        <strong>API:</strong> <code>{url}</code> (POST)
      </Typography>
      <Typography variant="subtitle2" mb={1}>
        Campos
      </Typography>
      <Box sx={{ overflowX: 'auto', mb: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Campo</TableCell>
              <TableCell>Tipo</TableCell>
              <TableCell>Obrigatório</TableCell>
              <TableCell>Valor esperado</TableCell>
              <TableCell>Descrição</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {c.campos.map(f => (
              <TableRow key={f.nome}>
                <TableCell>
                  <code>{f.nome}</code>
                </TableCell>
                <TableCell>{typeLabel(f)}</TableCell>
                <TableCell>{f.obrigatorio ? 'Sim (identifica o registro)' : 'Não'}</TableCell>
                <TableCell>{expected(f)}</TableCell>
                <TableCell>
                  {f.descricao}{' '}
                  {f.confirmar && (
                    <Chip size="small" variant="outlined" color="warning" label="nome/significado a confirmar" />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
      {c.observacao && (
        <Typography variant="body2" color="text.secondary" mb={2}>
          {c.observacao}
        </Typography>
      )}
      <Typography variant="subtitle2" mb={1}>
        Exemplo
      </Typography>
      <Code>{`POST ${url}\nAuthorization: Bearer hk_sua_chave\nContent-Type: application/json\n\n${json(c.exemplo)}`}</Code>
      <Typography variant="caption" color="text.secondary" display="block" mb={2}>
        Para enviar vários registros, mande uma lista:{' '}
        <code>
          [ {'{…}'}, {'{…}'} ]
        </code>
        .
      </Typography>
      <Typography variant="subtitle2" mb={1}>
        Operações
      </Typography>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Operação</TableCell>
              <TableCell>API</TableCell>
              <TableCell>O que faz</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell>Adicionar / atualizar</TableCell>
              <TableCell>
                <code>POST {path}</code>
              </TableCell>
              <TableCell>Salva o registro completo (cria ou atualiza pela chave) e devolve o id.</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Consultar</TableCell>
              <TableCell>
                <code>
                  GET {path}/{'{id}'}
                </code>
              </TableCell>
              <TableCell>
                Devolve o registro. <code>GET {path}</code> lista (<code>?limite=100&amp;depois={'{proximo}'}</code>).
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Alterar</TableCell>
              <TableCell>
                <code>
                  PATCH {path}/{'{id}'}
                </code>
              </TableCell>
              <TableCell>
                Altera só os campos enviados (a chave não muda). Ex.: <code>{`{ "${example}": … }`}</code>.
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Pausar / retomar</TableCell>
              <TableCell>
                <code>
                  POST {path}/{'{id}'}/pause
                </code>{' '}
                e <code>/resume</code>
              </TableCell>
              <TableCell>Pausado fica salvo, mas some dos terminais até ser retomado.</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Remover</TableCell>
              <TableCell>
                <code>
                  DELETE {path}/{'{id}'}
                </code>
              </TableCell>
              <TableCell>
                Remove de verdade: some do Hub e dos terminais. Salvar de novo com a mesma chave recria (mesmo id).
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Box>
    </Paper>
  );
}

// Hub > Documentacao: contratos da API publica (nomes simples, iguais para todos os clientes).

// ---- paginas do menu lateral (a montagem fica em HubDocsShell.js) ---------------------------------

export function Autenticacao({ base }) {
  return (
    <Stack spacing={3}>
      {base && (
        <Alert severity="info">
          Endereço da API: <code>{base}</code>
        </Alert>
      )}
      <Paper sx={section}>
        <Typography variant="h6" mb={1}>
          Documentação da API
        </Typography>
        <Typography mb={2}>
          Esta API recebe os cadastros do sistema do cliente (ERP) para que os terminais de venda os usem. Os campos são
          simples e iguais para todos os clientes: envie no formato abaixo e o Hub cuida do restante.
        </Typography>
        <Typography variant="subtitle2" mb={0.5}>
          Autenticação
        </Typography>
        <Typography variant="body2" mb={1}>
          Cada chamada leva a <strong>chave de API</strong> da empresa no cabeçalho <code>Authorization</code>. A chave
          é criada em Hub &rarr; Clientes &rarr; (cliente) &rarr; Chaves de API e aparece uma única vez.
        </Typography>
        <Code>Authorization: Bearer hk_sua_chave</Code>
        <Typography variant="subtitle2" mt={2} mb={0.5}>
          Como enviar
        </Typography>
        <Typography variant="body2" component="ul" sx={{ pl: 2.5, mt: 0, mb: 2 }}>
          <li>
            Método <code>POST</code>, corpo JSON (<code>Content-Type: application/json</code>), um objeto ou uma lista
            de até 5000 objetos.
          </li>
          <li>
            Envie o registro <strong>completo</strong>: campos que você não enviar ficam em branco. Os campos marcados
            como obrigatórios identificam o registro.
          </li>
          <li>Reenviar o mesmo registro é seguro: se nada mudou, nada é alterado.</li>
          <li>
            Ao salvar, a resposta traz o <strong>id</strong> de cada registro. Use o id para consultar,{' '}
            <strong>alterar</strong> (<code>PATCH</code>, só os campos que mudaram), <strong>pausar</strong>/retomar e{' '}
            <strong>remover</strong>. O id não muda; a chave de negócio (ex.: <code>codigo</code>) continua
            identificando o registro.
          </li>
          <li>
            Campos de sim/não são <code>Integer</code> com valor <code>0</code> ou <code>1</code>. Datas usam{' '}
            <code>AAAA-MM-DD</code>. Números decimais usam ponto.
          </li>
          <li>Campos que não estão na documentação são recusados.</li>
        </Typography>
        <Typography variant="subtitle2" mb={0.5}>
          Resposta
        </Typography>
        <Code>{`200 OK
{
  "recebidos": 2, "alterados": 1, "inalterados": 1,
  "registros": [
    { "indice": 0, "id": "8229cf5c-9dc4-4d45-8536-1681bba04944", "situacao": "criado",     "codigo": 5102 },
    { "indice": 1, "id": "82b9e13b-a076-4bf0-9d06-f651a2e01dc9", "situacao": "inalterado", "codigo": 6102 }
  ]
}`}</Code>
        <Typography variant="body2" color="text.secondary" mb={2}>
          <code>registros</code> segue a ordem enviada. <code>situacao</code>: <code>criado</code>,{' '}
          <code>alterado</code> ou <code>inalterado</code>. O <code>id</code> é o identificador do registro no Hub;
          guarde-o para alterar, pausar ou remover.
        </Typography>
        <Typography variant="subtitle2" mb={0.5}>
          Erros
        </Typography>
        <Typography variant="body2" mb={1}>
          Se algum registro for inválido, <strong>nenhum</strong> é gravado e a resposta indica qual registro (
          <code>indice</code>, começando em 0) e qual campo:
        </Typography>
        <Code>{`422 Unprocessable Entity
{
  "erro": "Dados invalidos. Nenhum registro foi gravado.",
  "detalhe": [
    { "indice": 1, "campo": "ativo", "erro": "valor invalido (veja os valores esperados)" },
    { "indice": 2, "campo": "codigo", "erro": "obrigatorio" }
  ]
}`}</Code>
        <Typography variant="body2" color="text.secondary">
          Outros códigos: <code>401</code> chave inválida ou revogada, <code>400</code> corpo que não é um objeto/lista,{' '}
          <code>413</code> lista com mais de 5000 registros.
        </Typography>
      </Paper>
    </Stack>
  );
}

export function Webhooks() {
  return (
    <Stack spacing={3}>
      <Paper id="webhooks" sx={section}>
        <Typography variant="h6" mb={1}>
          Webhooks
        </Typography>
        <Typography mb={2}>
          Para empresas de origem API, tudo que o PDV devolve ao Hub é <strong>enviado ao seu sistema</strong> por
          webhook: o Hub faz um <code>POST</code> JSON para a URL cadastrada (Hub &rarr; Clientes &rarr; (cliente)
          &rarr; menu &rarr; Webhooks), assinado com um segredo que só você conhece. Não é preciso consultar o Hub.
        </Typography>
        <Typography variant="subtitle2" mb={0.5}>
          Eventos
        </Typography>
        <Box sx={{ overflowX: 'auto', mb: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Evento</TableCell>
                <TableCell>Quando acontece</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell>
                  <code>nota</code>
                </TableCell>
                <TableCell>
                  O PDV emitiu uma nota/venda (<code>dados</code> traz o conteúdo enviado pelo PDV).
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <code>movimento-caixa</code>
                </TableCell>
                <TableCell>
                  O PDV registrou um movimento de caixa (abertura, sangria, suprimento, fechamento…).
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <code>email</code>
                </TableCell>
                <TableCell>O PDV pediu o envio de um e-mail (ex.: nota para o cliente).</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <code>ping</code>
                </TableCell>
                <TableCell>Teste disparado pelo botão “Testar” do gerencial.</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Box>
        <Typography variant="subtitle2" mb={0.5}>
          O que você recebe
        </Typography>
        <Code>{`POST https://seu-sistema.com.br/hub/webhook
Content-Type: application/json
X-Hub-Event: nota
X-Hub-Delivery: 5b0f6f9a-6a54-4a43-8d7f-3d9f1d2c9a10
X-Hub-Timestamp: 1793361620
X-Hub-Signature: sha256=3c1d…e9

{
  "id": "5b0f6f9a-6a54-4a43-8d7f-3d9f1d2c9a10",
  "evento": "nota",
  "criadoEm": "2026-10-30T12:00:20.000Z",
  "empresa": { "id": "…", "nome": "Cliente Exemplo" },
  "terminal": { "id": "…", "nome": "Caixa 01" },
  "chave": "nota-77",
  "dados": { … conteúdo enviado pelo PDV … }
}`}</Code>
        <Typography variant="subtitle2" mt={2} mb={0.5}>
          Conferir a assinatura
        </Typography>
        <Typography variant="body2" mb={1}>
          O segredo (<code>whsec_…</code>) aparece uma única vez ao criar o webhook. A assinatura é o HMAC-SHA256, em
          hexadecimal, de <code>{'{timestamp}.{corpo}'}</code> (o corpo exatamente como recebido). Recuse chamadas sem
          assinatura válida e com <code>X-Hub-Timestamp</code> muito antigo (ex.: mais de 5 minutos).
        </Typography>
        <Code>{`// Node.js
const esperado = 'sha256=' + crypto.createHmac('sha256', SEGREDO)
  .update(req.headers['x-hub-timestamp'] + '.' + corpoBruto).digest('hex');
const ok = crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(req.headers['x-hub-signature']));`}</Code>
        <Typography variant="subtitle2" mt={2} mb={0.5}>
          Resposta e novas tentativas
        </Typography>
        <Typography variant="body2" component="ul" sx={{ pl: 2.5, mt: 0, mb: 0 }}>
          <li>
            Responda <strong>2xx</strong> em até 10 segundos. Isso confirma o recebimento e equivale ao <code>ack</code>{' '}
            do envio (ele passa a “enviado”). Redirecionamentos não são seguidos.
          </li>
          <li>
            Qualquer outra resposta, erro de rede ou demora conta como falha: o Hub tenta de novo com espera crescente
            (1, 2, 4, 8, 16, 32 e 60 min), no máximo 8 tentativas. Depois fica “falhou” e pode ser reenviado no
            gerencial.
          </li>
          <li>
            A entrega é <strong>pelo menos uma vez</strong>: use <code>X-Hub-Delivery</code> (ou <code>chave</code>)
            para ignorar repetições.
          </li>
          <li>A URL precisa ser https e pública; endereços de rede interna são recusados.</li>
          <li>
            Continua possível buscar os envios por <code>GET /v1/tenants/{'{empresa}'}/outbox</code> e confirmar com{' '}
            <code>.../ack</code>.
          </li>
        </Typography>
      </Paper>
    </Stack>
  );
}

export function Comuns({ comuns }) {
  return (
    <Stack spacing={3}>
      {comuns.length > 0 && (
        <Paper sx={section}>
          <Typography variant="h6" mb={0.5}>
            Cadastros comuns
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={1.5}>
            São únicos no Hub, iguais para todos os clientes: não são enviados pela API. Os terminais recebem pela
            sincronização.
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Cadastro</TableCell>
                <TableCell>Como funciona</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {comuns.map(c => (
                <TableRow key={c.entidade}>
                  <TableCell>
                    <code>{c.entidade}</code>
                  </TableCell>
                  <TableCell>{c.motivo}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}

export function EmDefinicao({ pendentes }) {
  return (
    <Stack spacing={3}>
      {pendentes.length > 0 && (
        <Paper sx={section}>
          <Typography variant="h6" mb={0.5}>
            Em definição
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={1.5}>
            Estes recursos ainda não têm contrato publicado e não estão disponíveis na API.
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Recurso</TableCell>
                <TableCell>Por quê</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pendentes.map(p => (
                <TableRow key={p.entidade}>
                  <TableCell>
                    <code>{p.entidade}</code>
                  </TableCell>
                  <TableCell>{p.motivo}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}
