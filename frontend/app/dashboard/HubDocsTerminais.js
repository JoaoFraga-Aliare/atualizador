'use client';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';

const section = { p: { xs: 2, md: 3 } };
const Code = ({ children }) => (
  <Paper variant="outlined" sx={{ mb: 1 }}>
    <Box component="pre" sx={{ m: 0, p: 1.5, fontSize: 13, overflow: 'auto' }}>
      {children}
    </Box>
  </Paper>
);

const complete = `POST {base}/v1/terminals
Authorization: Bearer hk_sua_chave
Content-Type: application/json

{
  "codigo": "01",
  "nome": "Caixa 01",
  "empresa": {
    "razaoSocial": "Loja X LTDA", "nomeFantasia": "Loja X", "cnpj": "12345678000190",
    "inscricaoEstadual": "131234567", "cep": "78700000", "endereco": "Rua A", "numero": "10",
    "bairro": "Centro", "cidade": "RONDONOPOLIS", "uf": "MT", "codigoCidade": 5107602
  },
  "fiscal": { "serieNfce": "1", "csc": "ABC123", "idCsc": "000001", "operacao": 1, "consumidorFinal": 1 },
  "parametros": { "cai_loja": 7 },
  "certificado": { "pfx": "<arquivo .pfx em base64>", "senha": "senha-do-certificado", "nome": "loja.pfx" }
}`;

const response = `201 Created
{
  "situacao": "criado",
  "token": "tk_...",                 // aparece só na criação: configure no Integrador
  "id": "8229cf5c-9dc4-4d45-8536-1681bba04944",
  "codigo": "01", "nome": "Caixa 01", "ambiente": "producao", "ativo": true,
  "versaoConfiguracao": 1,
  "empresa": { ... }, "fiscal": { ... }, "parametros": { ... },
  "certificado": { "existe": true, "titular": "LOJA X LTDA:12345678000190", "valido_ate": "...", "dias_restantes": 364 },
  "avisos": []
}`;

const partial = `POST {base}/v1/terminals          // mesmo "codigo" = mesmo terminal: só o que vier muda
{ "codigo": "01", "fiscal": { "serieNfce": "2" } }

PATCH {base}/v1/terminals/{id}    // o mesmo, pelo id
{ "empresa": { "nomeFantasia": null }, "ativo": 0 }     // null limpa o campo`;

function Fields({ title, rows, note }) {
  return (
    <Paper sx={section}>
      <Typography variant="h6" mb={0.5}>
        {title}
      </Typography>
      {note && (
        <Typography variant="body2" color="text.secondary" mb={1.5}>
          {note}
        </Typography>
      )}
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Campo</TableCell>
              <TableCell>Corresponde a</TableCell>
              <TableCell>Descrição</TableCell>
              <TableCell>Tipo</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.campo}>
                <TableCell>
                  <code>{r.campo}</code>
                </TableCell>
                <TableCell>
                  <code>{r.parametro}</code>
                </TableCell>
                <TableCell>{r.rotulo}</TableCell>
                <TableCell>{r.tipo}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Paper>
  );
}

// Hub > Documentacao > Recursos > Terminais: cadastro do terminal inteiro pela API.
export default function TerminaisDoc({ data, base }) {
  const { empresa = [], fiscal = [], parametros = [] } = data || {},
    groups = [...new Set(parametros.map(p => p.grupo))];
  return (
    <Stack spacing={3}>
      <Paper sx={section}>
        <Typography variant="h6" mb={1}>
          Terminais
        </Typography>
        <Typography mb={2}>
          O sistema do cliente pode cadastrar o terminal <strong>inteiro</strong> pela API: empresa (emitente), dados
          fiscais, parâmetros do caixa e certificado digital. Tudo é opcional: envie <strong>só o que mudou</strong> ou
          mande <strong>tudo</strong> a cada chamada. Cada campo enviado é validado e, se algo estiver errado, nada é
          gravado (inclusive o certificado, que é conferido antes).
        </Typography>
        <Box sx={{ overflowX: 'auto', mb: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Operação</TableCell>
                <TableCell>API</TableCell>
                <TableCell>O que faz</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {[
                [
                  'Criar ou atualizar',
                  'POST /v1/terminals',
                  'Sem "codigo" (ou com um novo) cria e devolve o token (só nesta resposta). Com um "codigo" existente atualiza só o que veio.'
                ],
                ['Listar', 'GET /v1/terminals', 'Terminais da empresa.'],
                [
                  'Consultar',
                  'GET /v1/terminals/{id}',
                  'Dados e parâmetros atuais; o certificado aparece só como metadados (nunca o arquivo nem a senha).'
                ],
                ['Alterar', 'PATCH /v1/terminals/{id}', 'Altera só os campos enviados; null limpa o campo.'],
                ['Novo token', 'POST /v1/terminals/{id}/token', 'Gera outro token; o anterior deixa de valer na hora.'],
                ['Remover', 'DELETE /v1/terminals/{id}', 'Remove o terminal e seus parâmetros.'],
                [
                  'Certificado da empresa',
                  'PUT /v1/certificado · GET · DELETE',
                  'Mesmo certificado do campo "certificado" do terminal, sem mexer no terminal.'
                ]
              ].map(([a, b, c]) => (
                <TableRow key={b}>
                  <TableCell>{a}</TableCell>
                  <TableCell>
                    <code>{b}</code>
                  </TableCell>
                  <TableCell>{c}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
        <Typography variant="subtitle2" mb={0.5}>
          Cadastro completo
        </Typography>
        <Code>{complete.replaceAll('{base}', base || 'https://hub.exemplo.com')}</Code>
        <Typography variant="subtitle2" mt={2} mb={0.5}>
          Resposta
        </Typography>
        <Code>{response}</Code>
        <Typography variant="body2" color="text.secondary" mb={2}>
          <code>situacao</code>: <code>criado</code>, <code>alterado</code> ou <code>inalterado</code> (reenviar o mesmo
          conteúdo é seguro). <code>versaoConfiguracao</code> sobe a cada mudança; o terminal busca a configuração nova
          sozinho.
        </Typography>
        <Typography variant="subtitle2" mb={0.5}>
          Só o que mudou
        </Typography>
        <Code>{partial.replaceAll('{base}', base || 'https://hub.exemplo.com')}</Code>
      </Paper>

      <Paper sx={section}>
        <Typography variant="h6" mb={1}>
          Série e numeração das notas
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={1.5}>
          O ERP deve informar de tempos em tempos a série e o <strong>último número emitido</strong> de cada terminal
          (o PDV continua do número seguinte). Uma chamada atualiza todos, pelo <code>codigo</code> do terminal. O
          número <strong>só sobe</strong>: um valor menor ou igual ao do Hub (na mesma série) é ignorado e volta como
          aviso, para o terminal nunca repetir número. Série nova vale como enviada; <code>forcarNumeracao: true</code>{' '}
          permite voltar. Terminal desconhecido não é criado (<code>nao_encontrado</code>).
        </Typography>
        <Code>
          {`POST {base}/v1/terminals/numeracao
[
  { "codigo": "01", "serieNfce": "1", "ultimaNfce": 1520, "serieNfe": "1", "ultimaNfe": 87 },
  { "codigo": "02", "ultimaNfce": 430 }
]
// resposta: { "resultados": [ { "codigo": "01", "situacao": "alterado", "ultimaNfce": 1520, ... }, ... ] }`.replaceAll(
            '{base}',
            base || 'https://hub.exemplo.com'
          )}
        </Code>
        <Typography variant="body2" color="text.secondary" mt={1.5}>
          No PDV, o Integrador só aplica o número do Hub se for maior que o local; assim nota emitida e ainda não
          informada ao ERP nunca é sobrescrita.
        </Typography>
      </Paper>

      <Paper sx={section}>
        <Typography variant="h6" mb={1}>
          Certificado digital
        </Typography>
        <Typography variant="body2" component="ul" sx={{ pl: 2.5, mt: 0, mb: 1 }}>
          <li>
            Envie o certificado <strong>A1</strong> (<code>.pfx</code>) em base64 e a senha. Ex.:{' '}
            <code>base64 -w0 certificado.pfx</code>.
          </li>
          <li>
            O Hub confere a senha, a validade e se o CNPJ do certificado tem a mesma raiz do <code>empresa.cnpj</code>.
            Se algo falhar, nada é gravado.
          </li>
          <li>
            Fica guardado <strong>cifrado</strong> e nunca é devolvido: a resposta traz só titular, CNPJ, série e
            validade. Para trocar, envie outro.
          </li>
          <li>
            O certificado é da <strong>empresa</strong>: vale para todos os terminais dela. Os terminais o recebem pelo
            Integrador, que mantém uma cópia local protegida.
          </li>
          <li>
            Não use <code>parametros</code> para o certificado (<code>con_certsenha</code> e similares são recusados).
          </li>
        </Typography>
        <Alert severity="info">Certificado em token ou cartão (A3) não pode ser enviado.</Alert>
      </Paper>

      <Fields
        title="Empresa (emitente)"
        note="Dados que aparecem na nota. CNPJ e CEP podem ir com ou sem pontuação (o Hub guarda só os dígitos). codigoCidade é o código IBGE do município."
        rows={empresa}
      />
      <Fields
        title="Fiscal e venda"
        note="Série, numeração e credenciais da NFC-e/NF-e, operação do terminal e o código do cliente consumidor final."
        rows={fiscal}
      />

      <Paper sx={section}>
        <Typography variant="h6" mb={0.5}>
          Parâmetros do caixa
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={1.5}>
          Os demais parâmetros do PDV entram em <code>parametros</code> pelo nome do campo (os mesmos da tela de
          parametrização). Campo desconhecido ou valor inválido é recusado.
        </Typography>
        {groups.map(g => (
          <Accordion key={g} disableGutters variant="outlined">
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography fontWeight={600}>{g}</Typography>
              <Typography color="text.secondary" ml={1}>
                ({parametros.filter(p => p.grupo === g).length})
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableBody>
                    {parametros
                      .filter(p => p.grupo === g)
                      .map(p => (
                        <TableRow key={p.campo}>
                          <TableCell>
                            <code>{p.campo}</code>
                          </TableCell>
                          <TableCell>{p.rotulo}</TableCell>
                          <TableCell>
                            {p.tipo}
                            {p.opcoes ? ` (${p.opcoes.join(' | ')})` : ''}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </Box>
            </AccordionDetails>
          </Accordion>
        ))}
      </Paper>
    </Stack>
  );
}
