import { headers } from 'next/headers';
import { Box, Chip, Link as MuiLink, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { contratos, emDefinicao, entidades, type CampoContrato, type Contrato } from '@hub/contracts';

export const metadata = { title: 'Documentação — Hub de Integração' };

const secao = { p: { xs: 2, md: 3 } };

// Endereço da API mostrado nos exemplos. Ordem: HUB_PUBLIC_URL (se definido); senão o endereço pelo
// qual a própria página foi aberta (protocolo + host). Em desenvolvimento a API roda em outra porta
// (HUB_API_URL, ex.: http://localhost:4000): vale então o host da página com a porta da API, assim
// localhost vira http://localhost:4000 e, pelo IP da rede, http://192.168.5.22:4000.
async function enderecoDaApi(): Promise<string> {
  if (process.env.HUB_PUBLIC_URL) return process.env.HUB_PUBLIC_URL.replace(/\/$/, '');
  const h = await headers();
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost').split(',')[0].trim();
  const proto = (h.get('x-forwarded-proto') ?? (/^(localhost|127\.|192\.168\.|10\.)/.test(host) ? 'http' : 'https')).split(',')[0].trim();
  const hostname = host.replace(/:\d+$/, '');
  try {
    const api = new URL(process.env.HUB_API_URL ?? 'http://localhost:4000');
    if (['localhost', '127.0.0.1', '::1'].includes(api.hostname) && api.port) return `${proto}://${hostname}:${api.port}`;
  } catch { /* usa o host da página */ }
  return `${proto}://${host}`;
}

const rotuloTipo = (c: CampoContrato) =>
  c.tipo === 'texto' ? `String${c.tamanho ? ` (até ${c.tamanho})` : ''}`
    : c.tipo === 'inteiro' ? 'Integer' : c.tipo === 'decimal' ? 'Decimal' : 'Date';

const valoresEsperados = (c: CampoContrato) =>
  c.valores ?? (c.conversao ? '0 ou 1' : c.tipo === 'decimal' ? 'número, com ponto decimal' : c.tipo === 'inteiro' ? 'número inteiro' : '');

const json = (o: unknown) => JSON.stringify(o, null, 2);

const Codigo = ({ children }: { children: string }) => <Box component="pre" sx={{ m: 0, fontSize: 13 }}>{children}</Box>;

function Recurso({ c, base }: { c: Contrato; base: string }) {
  const url = `${base}/v1/${c.caminho}`;
  return (
    <Paper id={c.caminho} sx={secao}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 0.5 }}>
        <Typography variant="h6" component="h2">{c.titulo}</Typography>
        <Chip size="small" color="primary" label="POST" />
      </Box>
      <Typography mb={1.5}>{c.descricao}</Typography>
      <Typography variant="body2" mb={2}>
        <strong>API:</strong> <code>{url}</code> (POST)
      </Typography>

      <Typography variant="subtitle2" mb={1}>Campos</Typography>
      <Table size="small" sx={{ mb: 2 }}>
        <TableHead>
          <TableRow><TableCell>Campo</TableCell><TableCell>Tipo</TableCell><TableCell>Obrigatório</TableCell><TableCell>Valor esperado</TableCell><TableCell>Descrição</TableCell></TableRow>
        </TableHead>
        <TableBody>
          {c.campos.map((f) => (
            <TableRow key={f.nome}>
              <TableCell><code>{f.nome}</code></TableCell>
              <TableCell>{rotuloTipo(f)}</TableCell>
              <TableCell>{f.obrigatorio ? 'Sim (identifica o registro)' : 'Não'}</TableCell>
              <TableCell>{valoresEsperados(f)}</TableCell>
              <TableCell>
                {f.descricao}{' '}
                {f.confirmar && <Chip size="small" variant="outlined" color="warning" label="nome/significado a confirmar" />}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {c.observacao && <Typography variant="body2" color="text.secondary" mb={2}>{c.observacao}</Typography>}

      <Typography variant="subtitle2" mb={1}>Exemplo</Typography>
      <Paper variant="outlined" sx={{ p: 0, mb: 1 }}><Box sx={{ p: 1.5 }}><Codigo>{`POST ${url}
Authorization: Bearer hk_sua_chave
Content-Type: application/json

${json(c.exemplo)}`}</Codigo></Box></Paper>
      <Typography variant="caption" color="text.secondary" display="block" mb={2}>
        Para enviar vários registros, mande uma lista: <code>[ {'{…}'}, {'{…}'} ]</code>.
      </Typography>

      <Typography variant="subtitle2" mb={1}>Operações</Typography>
      <Table size="small">
        <TableHead><TableRow><TableCell>Operação</TableCell><TableCell>API</TableCell><TableCell>O que faz</TableCell></TableRow></TableHead>
        <TableBody>
          <TableRow><TableCell>Adicionar / atualizar</TableCell><TableCell><code>POST /v1/{c.caminho}</code></TableCell><TableCell>Salva o registro completo (cria ou atualiza pela chave) e devolve o <code>id</code>.</TableCell></TableRow>
          <TableRow><TableCell>Consultar</TableCell><TableCell><code>GET /v1/{c.caminho}/&#123;id&#125;</code></TableCell><TableCell>Devolve o registro. <code>GET /v1/{c.caminho}</code> lista (<code>?limite=100&amp;depois=&#123;proximo&#125;</code>).</TableCell></TableRow>
          <TableRow><TableCell>Alterar</TableCell><TableCell><code>PATCH /v1/{c.caminho}/&#123;id&#125;</code></TableCell><TableCell>Altera só os campos enviados (a chave não muda). Ex.: <code>{'{ "'}{c.campos.find((f) => !f.obrigatorio)?.nome ?? c.campos[0].nome}{'": … }'}</code>.</TableCell></TableRow>
          <TableRow><TableCell>Pausar / retomar</TableCell><TableCell><code>POST /v1/{c.caminho}/&#123;id&#125;/pause</code> e <code>/resume</code></TableCell><TableCell>Pausado fica salvo, mas some dos terminais até ser retomado.</TableCell></TableRow>
          <TableRow><TableCell>Remover</TableCell><TableCell><code>DELETE /v1/{c.caminho}/&#123;id&#125;</code></TableCell><TableCell>Remove de verdade: some do Hub e dos terminais. Salvar de novo com a mesma chave recria (mesmo <code>id</code>).</TableCell></TableRow>
        </TableBody>
      </Table>
    </Paper>
  );
}

export default async function Docs() {
  const base = await enderecoDaApi();
  // recursos sem contrato: os que a equipe marcou em `emDefinicao` e qualquer outro do catalogo ainda sem contrato
  const publicas = new Set(contratos.map((c) => c.entidade));
  const marcados = new Set(emDefinicao.map((d) => d.entidade));
  const pendentes = [
    ...emDefinicao,
    ...Object.values(entidades).filter((e) => !publicas.has(e.nome as never) && !marcados.has(e.nome as never)).map((e) => ({ entidade: e.nome as never, motivo: 'Nomes e campos em revisao.' })),
  ];

  return (
    <Stack spacing={3}>
      <Paper sx={secao}>
        <Typography variant="h6" mb={1}>Documentação da API</Typography>
        <Typography mb={2}>
          Esta API recebe os cadastros do seu sistema (ERP) para que os terminais de venda os usem. Os campos são simples e iguais para
          todos os clientes: você envia no formato abaixo e o Hub cuida do restante.
        </Typography>

        <Typography variant="subtitle2" mt={2} mb={0.5}>Autenticação</Typography>
        <Typography variant="body2" mb={1}>
          Cada chamada leva a <strong>chave de API</strong> da sua empresa no cabeçalho <code>Authorization</code>. A chave é criada no
          gerencial (empresa &rarr; Chaves de API) e aparece uma única vez.
        </Typography>
        <Paper variant="outlined" sx={{ mb: 2 }}><Box sx={{ p: 1.5 }}><Codigo>Authorization: Bearer hk_sua_chave</Codigo></Box></Paper>

        <Typography variant="subtitle2" mb={0.5}>Como enviar</Typography>
        <Typography variant="body2" component="ul" sx={{ pl: 2.5, mt: 0, mb: 2 }}>
          <li>Método <code>POST</code>, corpo JSON (<code>Content-Type: application/json</code>), um objeto ou uma lista de até 5000 objetos.</li>
          <li>Envie o registro <strong>completo</strong>: campos que você não enviar ficam em branco. Os campos marcados como obrigatórios identificam o registro.</li>
          <li>Reenviar o mesmo registro é seguro: se nada mudou, nada é alterado.</li>
          <li>Ao salvar, a resposta traz o <strong>id</strong> de cada registro. Use o id para consultar, <strong>alterar</strong> (<code>PATCH</code>, só os campos que mudaram — ideal para saldo e preço, sem reenviar o cadastro), <strong>pausar</strong>/retomar e <strong>remover</strong>. O id não muda; a chave de negócio (ex.: <code>codigo</code>) continua identificando o registro.</li>
          <li>Campos de sim/não são <code>Integer</code> com valor <code>0</code> ou <code>1</code>. Datas usam <code>AAAA-MM-DD</code>. Números decimais usam ponto.</li>
          <li>Campos que não estão na documentação são recusados.</li>
        </Typography>

        <Typography variant="subtitle2" mb={0.5}>Resposta</Typography>
        <Paper variant="outlined" sx={{ mb: 2 }}><Box sx={{ p: 1.5 }}><Codigo>{`200 OK
{
  "recebidos": 2, "alterados": 1, "inalterados": 1,
  "registros": [
    { "indice": 0, "id": "8229cf5c-9dc4-4d45-8536-1681bba04944", "situacao": "criado",     "codigo": 5102 },
    { "indice": 1, "id": "82b9e13b-a076-4bf0-9d06-f651a2e01dc9", "situacao": "inalterado", "codigo": 6102 }
  ]
}`}</Codigo></Box></Paper>
        <Typography variant="body2" color="text.secondary" mb={2}>
          <code>registros</code> segue a ordem enviada. <code>situacao</code>: <code>criado</code>, <code>alterado</code> ou <code>inalterado</code>. O
          <code> id</code> é o identificador do registro no Hub; guarde-o para alterar, pausar ou remover.
        </Typography>

        <Typography variant="subtitle2" mb={0.5}>Erros</Typography>
        <Typography variant="body2" mb={1}>
          Se algum registro for inválido, <strong>nenhum</strong> é gravado e a resposta indica qual registro (<code>indice</code>, começando em 0) e qual campo:
        </Typography>
        <Paper variant="outlined"><Box sx={{ p: 1.5 }}><Codigo>{`422 Unprocessable Entity
{
  "erro": "Dados invalidos. Nenhum registro foi gravado.",
  "detalhe": [
    { "indice": 1, "campo": "ativo", "erro": "valor invalido (veja os valores esperados)" },
    { "indice": 2, "campo": "codigo", "erro": "obrigatorio" }
  ]
}`}</Codigo></Box></Paper>
        <Typography variant="body2" color="text.secondary" mt={1}>
          Outros códigos: <code>401</code> chave inválida ou revogada, <code>400</code> corpo que não é um objeto/lista, <code>413</code> lista com mais de 5000 registros.
        </Typography>
      </Paper>

      <Paper sx={secao}>
        <Typography variant="h6" mb={2}>Recursos ({contratos.length})</Typography>
        <Table size="small">
          <TableHead><TableRow><TableCell>Recurso</TableCell><TableCell>API</TableCell><TableCell align="right">Campos</TableCell></TableRow></TableHead>
          <TableBody>
            {contratos.map((c) => (
              <TableRow key={c.caminho} hover>
                <TableCell><MuiLink href={`#${c.caminho}`} underline="hover">{c.titulo}</MuiLink></TableCell>
                <TableCell><code>POST /v1/{c.caminho}</code></TableCell>
                <TableCell align="right">{c.campos.length}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      {contratos.map((c) => <Recurso key={c.caminho} c={c} base={base} />)}

      {pendentes.length > 0 && (
        <Paper sx={secao}>
          <Typography variant="h6" mb={0.5}>Em definição</Typography>
          <Typography variant="body2" color="text.secondary" mb={1.5}>
            Estes recursos ainda não têm contrato publicado e não estão disponíveis na API.
          </Typography>
          <Table size="small">
            <TableHead><TableRow><TableCell>Recurso</TableCell><TableCell>Por quê</TableCell></TableRow></TableHead>
            <TableBody>
              {pendentes.map((p) => (
                <TableRow key={p.entidade}><TableCell><code>{p.entidade}</code></TableCell><TableCell>{p.motivo}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}
