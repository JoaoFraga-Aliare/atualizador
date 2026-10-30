'use client';
import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Link as MuiLink,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import {
  Cancel as CancelIcon,
  CheckCircle as CheckCircleIcon,
  CheckCircleOutline as CheckIcon,
  Refresh as RefreshIcon,
  RadioButtonUnchecked as RadioButtonUncheckedIcon
} from '@mui/icons-material';
import { api } from '../../lib/api';
import { IconAction, hubError } from './HubUi';
import { Autenticacao, Comuns, EmDefinicao, Resource, Webhooks } from './HubDocs';
import TerminaisDoc from './HubDocsTerminais';
import PostmanDoc from './HubDocsPostman';

const section = { p: { xs: 2, md: 3 } };
const base = '/hub/documentacao/';
const groupOrder = ['Terminal', 'Fiscal', 'Cadastros', 'Recomendado'];

function RecursosIndice({ contratos, go }) {
  return (
    <Paper sx={section}>
      <Typography variant="h6" mb={0.5}>
        Recursos ({contratos.length})
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Cada recurso é enviado com <code>POST /v1/&#123;recurso&#125;</code> e a chave de API do cliente. Escolha um no
        menu ao lado para ver os campos, o exemplo e as operações.
      </Typography>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Recurso</TableCell>
              <TableCell>API</TableCell>
              <TableCell align="right">Campos</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {contratos.map(c => (
              <TableRow key={c.caminho} hover>
                <TableCell>
                  <MuiLink component="button" underline="hover" onClick={() => go(`${base}recursos/${c.caminho}/`)}>
                    {c.titulo}
                  </MuiLink>
                </TableCell>
                <TableCell>
                  <code>POST /v1/{c.caminho}</code>
                </TableCell>
                <TableCell align="right">{c.campos.length}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Paper>
  );
}

// Criterios de homologacao: o que o integrador precisa enviar ao Hub para o PDV conseguir vender.
const specialResources = {
  terminals: { titulo: 'Terminais', label: 'POST /v1/terminals · Terminais', page: 'terminais' },
  certificado: { titulo: 'Certificado', label: 'PUT /v1/certificado · Certificado', page: 'terminais' }
};

// Situacao do proprio desenvolvedor em cada criterio (so quando ele esta em homologacao).
function Status({ item }) {
  if (!item) return null;
  const Icon = item.ok ? CheckCircleIcon : item.obrigatorio ? CancelIcon : RadioButtonUncheckedIcon,
    color = item.ok ? 'success.main' : item.obrigatorio ? 'error.main' : 'text.disabled';
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
      <Icon sx={{ color }} fontSize="small" aria-label={item.ok ? 'apto' : 'falta'} />
      <Box>
        <Typography variant="body2" fontWeight={600} sx={{ color }}>
          {item.ok ? 'Apto' : item.obrigatorio ? 'Falta' : 'Pendente'}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block">
          {item.detalhe}
        </Typography>
      </Box>
    </Box>
  );
}

function Homologacao({ criterios, ordemDeCarga, contratos, go }) {
  const byPath = Object.fromEntries(contratos.map(c => [c.caminho, c])),
    [mine, setMine] = useState(null),
    [loading, setLoading] = useState(false),
    load = () => {
      setLoading(true);
      api('/admin/hub/me/readiness')
        .then(r => setMine(r.applicable ? r : null))
        .catch(() => setMine(null))
        .finally(() => setLoading(false));
    };
  useEffect(load, []);
  const status = mine ? Object.fromEntries(mine.itens.map(i => [i.id, i])) : null,
    aptos = mine ? mine.itens.filter(i => i.obrigatorio && i.ok).length : 0;
  const groups = groupOrder.filter(g => criterios.some(c => c.grupo === g));
  return (
    <Stack spacing={3}>
      {mine && (
        <Paper sx={section}>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', mb: 1 }}>
            <Typography variant="h6">Sua homologação</Typography>
            {mine.homologated ? (
              <Chip
                color="success"
                label={mine.approvedMissing > 0 ? `Homologado (${mine.approvedMissing} pendência(s))` : 'Homologado'}
              />
            ) : (
              <Chip color="warning" label="Em homologação" />
            )}
            <Box sx={{ ml: 'auto' }}>
              <IconAction title="Atualizar" icon={RefreshIcon} onClick={load} disabled={loading} />
            </Box>
          </Box>
          {mine.faltam === 0 ? (
            <Alert severity="success">
              Você está apto em todos os {mine.obrigatorios} itens obrigatórios. Aguarde a liberação.
            </Alert>
          ) : (
            <Alert severity="warning">
              Você está apto em {aptos} de {mine.obrigatorios} itens obrigatórios. Faltam {mine.faltam}: veja a coluna
              “Seu status” nas tabelas abaixo.
            </Alert>
          )}
        </Paper>
      )}
      <Paper sx={section}>
        <Typography variant="h6" mb={1}>
          Critérios de homologação
        </Typography>
        <Typography mb={2}>
          Antes de liberar o seu cadastro de clientes, conferimos se o Hub já tem o que o PDV exige para emitir uma
          venda. Os itens <strong>obrigatórios</strong> precisam estar enviados; os <strong>recomendados</strong> não
          bloqueiam.{' '}
          {mine
            ? 'A coluna “Seu status” mostra o que já chegou ao Hub.'
            : 'Na homologação você vê este checklist com um ✓ no que já chegou.'}
        </Typography>
        <Typography variant="subtitle2" mb={0.5}>
          Ordem de envio sugerida
        </Typography>
        <Typography variant="body2" component="ol" sx={{ pl: 2.5, mt: 0, mb: 0 }}>
          {ordemDeCarga.map(item => (
            <li key={item}>{item}</li>
          ))}
        </Typography>
      </Paper>

      {groups.map(g => (
        <Paper key={g} sx={section}>
          <Typography variant="h6" mb={1.5}>
            {g}
          </Typography>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>O que o PDV exige</TableCell>
                  <TableCell>Obrigatório</TableCell>
                  <TableCell>O que enviar ao Hub</TableCell>
                  {mine && <TableCell>Seu status</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {criterios
                  .filter(c => c.grupo === g)
                  .map(c => (
                    <TableRow key={c.id}>
                      <TableCell sx={{ minWidth: 220 }}>
                        <Typography variant="body2" fontWeight={600}>
                          {c.titulo}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {c.descricao}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {c.obrigatorio ? (
                          <Chip size="small" color="primary" icon={<CheckIcon />} label="obrigatório" />
                        ) : (
                          <Chip size="small" variant="outlined" label="recomendado" />
                        )}
                      </TableCell>
                      <TableCell>
                        {c.enviar.length > 0 && (
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: c.como ? 1 : 0 }}>
                            {c.enviar.map(r =>
                              specialResources[r] ? (
                                <Chip
                                  key={r}
                                  size="small"
                                  color="primary"
                                  variant="outlined"
                                  clickable
                                  onClick={() => go(`${base}recursos/${specialResources[r].page}/`)}
                                  label={specialResources[r].label}
                                />
                              ) : byPath[r] ? (
                                <Chip
                                  key={r}
                                  size="small"
                                  color="primary"
                                  variant="outlined"
                                  clickable
                                  onClick={() => go(`${base}recursos/${r}/`)}
                                  label={`POST /v1/${r} · ${byPath[r].titulo}`}
                                />
                              ) : (
                                <Chip key={r} size="small" variant="outlined" label={`/v1/${r}`} />
                              )
                            )}
                          </Box>
                        )}
                        {c.como && (
                          <Typography variant="body2" color={c.semApi ? 'warning.main' : 'text.secondary'}>
                            {c.como}
                          </Typography>
                        )}
                      </TableCell>
                      {mine && (
                        <TableCell sx={{ minWidth: 180 }}>
                          <Status item={status[c.id]} />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </Box>
        </Paper>
      ))}
    </Stack>
  );
}

function NavItem({ label, active, depth = 0, onClick }) {
  return (
    <ListItemButton
      selected={active}
      onClick={onClick}
      sx={{ borderRadius: 2, py: 0.6, pl: 1.5 + depth * 2, mb: 0.25 }}
    >
      <ListItemText
        primary={label}
        primaryTypographyProps={{ fontSize: depth ? 13 : 14, fontWeight: depth ? 500 : 700 }}
      />
    </ListItemButton>
  );
}

// Hub > Documentacao: menu lateral (Autenticacao, Webhooks, Postman, Recursos, Criterios de homologacao) e uma
// pagina por assunto. Enderecos: /hub/documentacao/<secao>/[<recurso>]/
export default function HubDocsShell({ segments = [], go }) {
  const [docs, setDocs] = useState(null),
    [error, setError] = useState('');
  useEffect(() => {
    api('/admin/hub/docs')
      .then(setDocs)
      .catch(e => setError(hubError(e).error));
  }, []);
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!docs) return <Typography>Carregando…</Typography>;

  const { contratos, pendentes, comuns = [], criterios = [], ordemDeCarga = [], base: apiBase } = docs,
    [section0, item] = segments,
    current = ['autenticacao', 'webhooks', 'recursos', 'homologacao', 'postman'].includes(section0) ? section0 : 'autenticacao',
    to = (...parts) => go(`${base}${parts.join('/')}/`),
    resource = current === 'recursos' && item ? contratos.find(c => c.caminho === item) : null;

  let page;
  if (current === 'autenticacao') page = <Autenticacao base={apiBase} />;
  else if (current === 'webhooks') page = <Webhooks />;
  else if (current === 'postman') page = <PostmanDoc base={apiBase} />;
  else if (current === 'homologacao')
    page = <Homologacao criterios={criterios} ordemDeCarga={ordemDeCarga} contratos={contratos} go={go} />;
  else if (item === 'terminais') page = <TerminaisDoc data={docs.terminais} base={apiBase} />;
  else if (item === 'cadastros-comuns') page = <Comuns comuns={comuns} />;
  else if (item === 'em-definicao') page = <EmDefinicao pendentes={pendentes} />;
  else if (resource) page = <Resource c={resource} base={apiBase} />;
  else if (item) page = <Alert severity="warning">Recurso não encontrado.</Alert>;
  else page = <RecursosIndice contratos={contratos} go={go} />;

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '260px 1fr' }, gap: 3, alignItems: 'start' }}>
      <Paper
        sx={{
          p: 1.5,
          position: { md: 'sticky' },
          top: { md: 88 },
          maxHeight: { md: 'calc(100vh - 110px)' },
          overflowY: 'auto'
        }}
      >
        <Typography variant="overline" color="text.secondary" sx={{ px: 1.5 }}>
          Documentação
        </Typography>
        <List component="nav" aria-label="Documentação" disablePadding>
          <NavItem label="Autenticação" active={current === 'autenticacao'} onClick={() => to('autenticacao')} />
          <NavItem label="Webhooks" active={current === 'webhooks'} onClick={() => to('webhooks')} />
          <NavItem label="Postman" active={current === 'postman'} onClick={() => to('postman')} />
          <NavItem label="Recursos" active={current === 'recursos' && !item} onClick={() => to('recursos')} />
          <Collapse in={current === 'recursos'} unmountOnExit>
            <List disablePadding>
              <NavItem
                depth={1}
                label="Terminais"
                active={item === 'terminais'}
                onClick={() => to('recursos', 'terminais')}
              />
              {contratos.map(c => (
                <NavItem
                  key={c.caminho}
                  depth={1}
                  label={c.titulo}
                  active={item === c.caminho}
                  onClick={() => to('recursos', c.caminho)}
                />
              ))}
              {comuns.length > 0 && (
                <NavItem
                  depth={1}
                  label="Cadastros comuns"
                  active={item === 'cadastros-comuns'}
                  onClick={() => to('recursos', 'cadastros-comuns')}
                />
              )}
              {pendentes.length > 0 && (
                <NavItem
                  depth={1}
                  label="Em definição"
                  active={item === 'em-definicao'}
                  onClick={() => to('recursos', 'em-definicao')}
                />
              )}
            </List>
          </Collapse>
          <NavItem
            label="Critérios de homologação"
            active={current === 'homologacao'}
            onClick={() => to('homologacao')}
          />
        </List>
      </Paper>
      <Box sx={{ minWidth: 0 }}>{page}</Box>
    </Box>
  );
}
