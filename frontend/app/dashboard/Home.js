'use client';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, Paper, Skeleton, Stack, Typography } from '@mui/material';
import { CleaningServices as CleaningServicesIcon } from '@mui/icons-material';
import { StatsCards } from './components';
import ReleaseCleanupDialog from './ReleaseCleanupDialog';
import { channelColors, fmt } from './format';
import { api } from '../../lib/api';

const mb = value => (Number(value || 0) / 1024 / 1024).toFixed(1),
  day = offset => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10),
  channelLabel = { production: 'Produção', beta: 'Beta', test: 'Test' };

// Lista de barras horizontais; a primeira linha e destacada como a de maior valor.
function BarList({ items, unit = '', empty, onSelect }) {
  const max = Math.max(...items.map(x => x.value), 1);
  if (!items.length)
    return (
      <Typography variant="body2" color="text.secondary" py={3} textAlign="center">
        {empty}
      </Typography>
    );
  return (
    <Stack spacing={1.5}>
      {items.map((item, index) => (
        <Box
          key={item.key || item.label}
          onClick={onSelect ? () => onSelect(item) : undefined}
          sx={{
            cursor: onSelect ? 'pointer' : 'default',
            '&:hover .bar-label': onSelect ? { color: 'primary.main' } : {}
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={2} mb={0.5}>
            <Typography
              className="bar-label"
              variant="body2"
              fontWeight={index === 0 ? 700 : 500}
              noWrap
              title={item.label}
            >
              {item.label}
              {item.sub && (
                <Typography component="span" variant="caption" color="text.secondary" ml={1}>
                  {item.sub}
                </Typography>
              )}
            </Typography>
            <Typography variant="body2" fontWeight={700} flexShrink={0}>
              {item.value}
              {unit && (
                <Typography component="span" variant="caption" color="text.secondary" ml={0.5}>
                  {unit}
                </Typography>
              )}
            </Typography>
          </Stack>
          <Box sx={{ height: 8, borderRadius: 4, bgcolor: '#f2f4f7', overflow: 'hidden' }}>
            <Box
              sx={{
                width: `${Math.max((item.value / max) * 100, 3)}%`,
                height: '100%',
                borderRadius: 4,
                bgcolor: item.color || (index === 0 ? 'primary.main' : '#9bdce6'),
                transition: 'width .4s ease'
              }}
            />
          </Box>
        </Box>
      ))}
    </Stack>
  );
}

function Panel({ title, subtitle, action, children }) {
  return (
    <Paper sx={{ p: 3, height: '100%' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2} mb={2.5}>
        <Box>
          <Typography variant="h6" fontSize={16}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        {action}
      </Stack>
      {children}
    </Paper>
  );
}

function Highlight({ value, label }) {
  return (
    <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: 'primary.light', mb: 2.5 }}>
      <Typography variant="body2" color="primary.dark">
        {label}
      </Typography>
      <Typography variant="h5" fontWeight={700} color="primary.dark" letterSpacing="-.02em">
        {value}
      </Typography>
    </Box>
  );
}

function ClientsPanel({ clients, onOpen }) {
  const ranking = useMemo(
      () =>
        clients
          .map(c => ({ key: c.id, label: c.name, value: c.terminal_count, client: c }))
          .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'pt-BR'))
          .slice(0, 8),
      [clients]
    ),
    total = clients.reduce((sum, c) => sum + c.terminal_count, 0),
    top = ranking[0],
    recent = clients
      .filter(c => c.last_seen_at)
      .sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at))
      .slice(0, 6);
  return (
    <>
      <Panel title="Clientes" subtitle="Terminais por cliente · clique para ver os terminais">
        {top && (
          <Highlight
            label="Maior base instalada"
            value={`${top.label} (${top.value} ${top.value === 1 ? 'terminal' : 'terminais'})`}
          />
        )}
        <BarList
          items={ranking}
          unit="term."
          empty="Nenhum cliente com terminais."
          onSelect={item => onOpen(item.client)}
        />
        <Typography variant="caption" color="text.secondary" display="block" mt={2}>
          {clients.length} cliente(s) · {total} terminal(is) no total
        </Typography>
      </Panel>
      <Panel title="Últimos contatos" subtitle="Clientes que se comunicaram há pouco">
        <Stack divider={<Box sx={{ borderTop: '1px solid', borderColor: 'divider' }} />} spacing={1.25}>
          {recent.map(c => (
            <Stack
              key={c.id}
              direction="row"
              justifyContent="space-between"
              spacing={2}
              onClick={() => onOpen(c)}
              sx={{ cursor: 'pointer', pt: 1.25, '&:first-of-type': { pt: 0 }, '&:hover': { color: 'primary.main' } }}
            >
              <Typography variant="body2" fontWeight={600} noWrap>
                {c.name}
              </Typography>
              <Typography variant="body2" color="text.secondary" flexShrink={0}>
                {fmt(c.last_seen_at)}
              </Typography>
            </Stack>
          ))}
          {!recent.length && (
            <Typography variant="body2" color="text.secondary">
              Nenhum contato registrado.
            </Typography>
          )}
        </Stack>
      </Panel>
    </>
  );
}

function TerminalsPanel({ releases, clients }) {
  const byChannel = useMemo(() => {
      const map = new Map();
      for (const r of releases) map.set(r.channel, (map.get(r.channel) || 0) + (r.terminal_count || 0));
      return [...map]
        .map(([channel, value]) => ({
          key: channel,
          label: channelLabel[channel] || channel,
          value,
          color: channelColors[channel]
        }))
        .sort((a, b) => b.value - a.value);
    }, [releases]),
    byClient = useMemo(
      () =>
        clients
          .map(c => ({ key: c.id, label: c.name, value: c.terminal_count }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 5),
      [clients]
    );
  return (
    <>
      <Panel title="Terminais por canal" subtitle="Terminais em cada canal de distribuição">
        <BarList items={byChannel} unit="term." empty="Sem terminais em versões publicadas." />
      </Panel>
      <Panel title="Clientes com mais terminais" subtitle="Top 5">
        <BarList items={byClient} unit="term." empty="Sem dados." />
      </Panel>
    </>
  );
}

function ReleasesPanel({ releases, cleanup, onClean }) {
  const inUse = useMemo(
    () =>
      releases
        .filter(r => !r.deleted_at && r.terminal_count > 0)
        .sort((a, b) => b.terminal_count - a.terminal_count)
        .slice(0, 6)
        .map(r => ({
          key: r.id,
          label: `${r.product_name} ${r.version}`,
          sub: channelLabel[r.channel] || r.channel,
          value: r.terminal_count,
          color: channelColors[r.channel]
        })),
    [releases]
  );
  return (
    <>
      <Panel title="Versões mais usadas" subtitle="Quantidade de terminais em cada versão">
        <BarList items={inUse} unit="term." empty="Nenhuma versão em uso." />
      </Panel>
      <Panel
        title="Versões que podem ser limpas"
        subtitle="Sem nenhum terminal e disponíveis para exclusão"
        action={
          cleanup?.count > 0 && (
            <Button size="small" variant="contained" startIcon={<CleaningServicesIcon />} onClick={onClean}>
              Revisar
            </Button>
          )
        }
      >
        {!cleanup && <Skeleton variant="rounded" height={90} />}
        {cleanup && cleanup.count === 0 && (
          <Alert severity="success" icon={false}>
            Nada para limpar no momento.
          </Alert>
        )}
        {cleanup && cleanup.count > 0 && (
          <>
            <Highlight
              label="Espaço que pode ser liberado"
              value={`${mb(cleanup.sizeBytes)} MB em ${cleanup.count} versão(ões)`}
            />
            <BarList
              items={cleanup.candidates
                .slice()
                .sort((a, b) => b.reclaim_bytes - a.reclaim_bytes)
                .slice(0, 5)
                .map(c => ({
                  key: c.id,
                  label: `${c.product_name} ${c.version}`,
                  sub: channelLabel[c.channel] || c.channel,
                  value: Number(mb(c.reclaim_bytes)),
                  color: '#f79009'
                }))}
              unit="MB"
            />
          </>
        )}
      </Panel>
    </>
  );
}

function ErrorsPanel({ analysis, error }) {
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!analysis)
    return (
      <Panel title="Erros">
        <Skeleton variant="rounded" height={160} />
      </Panel>
    );
  const types = analysis.charts.byException
      .slice(0, 8)
      .map(x => ({ label: x.label, value: x.count, color: '#f04438' })),
    clients = analysis.charts.byClient.slice(0, 5).map(x => ({ label: x.label, value: x.count, color: '#fda29b' })),
    top = types[0];
  return (
    <>
      <Panel title="Erros mais comuns" subtitle="Tipos de exceção · erros distintos nos últimos 7 dias">
        {top && <Highlight label="Tipo que mais acontece" value={top.label} />}
        <BarList items={types} unit="erro(s)" empty="Nenhum erro nos últimos 7 dias." />
        <Stack direction="row" spacing={1} mt={2}>
          <Chip size="small" label={`${analysis.uniqueCount} distinto(s)`} />
          <Chip size="small" label={`${analysis.occurrenceCount} ocorrência(s)`} />
        </Stack>
      </Panel>
      <Panel title="Clientes com mais erros" subtitle="Top 5 nos últimos 7 dias">
        <BarList items={clients} unit="erro(s)" empty="Nenhum erro nos últimos 7 dias." />
      </Panel>
    </>
  );
}

function Metric({ label, value, sub, color }) {
  return (
    <Box sx={{ p: 2, borderRadius: 2.5, border: '1px solid', borderColor: 'divider' }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h4" fontWeight={700} letterSpacing="-.02em" color={color}>
        {value}
      </Typography>
      {sub && (
        <Typography variant="caption" color="text.secondary">
          {sub}
        </Typography>
      )}
    </Box>
  );
}

// Administrador geral: Hub de Integracao (players, clientes por player e trafego das ultimas 24 h).
// Se o Hub estiver fora do ar, o resto do painel segue normal.
function HubSummary() {
  const [overview, setOverview] = useState(null),
    [error, setError] = useState('');
  useEffect(() => {
    api('/admin/hub/overview')
      .then(setOverview)
      .catch(e => setError(e.message === 'hub_not_configured' ? '' : 'Não foi possível carregar o resumo do Hub.'));
  }, []);
  if (error) return <Alert severity="warning">{error}</Alert>;
  if (!overview) return null;
  const { pdv, others } = overview.last24h,
    players = overview.byPlayer
      .map(p => ({
        key: p.id,
        label: p.name,
        sub: p.homologation ? `+${p.homologation} em homologação` : undefined,
        value: p.clients,
        color: p.id === 'agrosys' ? '#2e90fa' : undefined
      }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'pt-BR'));
  return (
    <Panel title="Hub de Integração" subtitle="Players, clientes e tráfego do PDV nas últimas 24 h">
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, mb: 3 }}>
        <Metric label="Players" value={overview.players} sub="desenvolvedores cadastrados" />
        <Metric
          label="Clientes"
          value={overview.clients}
          sub={`${overview.homologationClients} de homologação · ${overview.terminals} terminal(is)`}
        />
        <Metric
          label="Requisições (24 h)"
          value={pdv.requisicoes}
          sub={others.requisicoes ? `PDV · +${others.requisicoes} de ERP/API` : 'PDV'}
        />
        <Metric
          label="Erros (24 h)"
          value={pdv.erros}
          color={pdv.erros ? 'error.main' : undefined}
          sub={others.erros ? `PDV · +${others.erros} de ERP/API` : 'PDV'}
        />
      </Box>
      <Typography variant="subtitle2" mb={1.5}>
        Clientes por player
      </Typography>
      <BarList items={players} unit="cliente(s)" empty="Nenhum player cadastrado." />
    </Panel>
  );
}

export default function Home({ data, stats, selectedChannels, toggleChannel, showClient, done, admin }) {
  const [focus, setFocus] = useState('clients'),
    [cleanup, setCleanup] = useState(null),
    [cleanupOpen, setCleanupOpen] = useState(false),
    [analysis, setAnalysis] = useState(null),
    [analysisError, setAnalysisError] = useState('');
  useEffect(() => {
    api('/admin/release-cleanup')
      .then(setCleanup)
      .catch(() => setCleanup({ count: 0, sizeBytes: 0, candidates: [] }));
  }, [data.releases]);
  useEffect(() => {
    if (focus !== 'errors' || analysis) return;
    api(`/admin/errors/analysis?startDate=${day(6)}&endDate=${day(0)}&includeIgnored=false`)
      .then(setAnalysis)
      .catch(e => setAnalysisError(e.message));
  }, [focus, analysis]);
  return (
    <Stack spacing={3}>
      {admin && <HubSummary />}
      <StatsCards
        stats={stats}
        selectedChannels={selectedChannels}
        toggleChannel={toggleChannel}
        selected={focus}
        onSelect={setFocus}
      />
      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>
        {focus === 'clients' && <ClientsPanel clients={data.clients} onOpen={showClient} />}
        {focus === 'terminals' && <TerminalsPanel releases={data.releases} clients={data.clients} />}
        {focus === 'releases' && (
          <ReleasesPanel releases={data.releases} cleanup={cleanup} onClean={() => setCleanupOpen(true)} />
        )}
        {focus === 'errors' && <ErrorsPanel analysis={analysis} error={analysisError} />}
      </Box>
      <ReleaseCleanupDialog
        value={cleanupOpen ? cleanup : null}
        close={() => setCleanupOpen(false)}
        done={text => {
          setCleanupOpen(false);
          done(text);
        }}
      />
    </Stack>
  );
}
