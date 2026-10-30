'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Tooltip
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { Grid } from './components';
import { maskCnpjInput } from './format';
import { api } from '../../lib/api';
import { IconAction, hubError } from './HubUi';
import HubTenant from './HubTenant';

const origins = { agrosys: 'Agrosys', api: 'API' };

// Cliente de homologacao (testes do desenvolvedor) x cliente de producao.
export function EnvironmentChip({ homologation, owner }) {
  return homologation ? (
    <Tooltip title={owner ? `Cliente de homologação de ${owner}` : 'Cliente de homologação (testes)'}>
      <Chip size="small" color="warning" variant="outlined" label={owner ? `Homologação · ${owner}` : 'Homologação'} />
    </Tooltip>
  ) : (
    <Chip size="small" color="success" variant="outlined" label="Produção" />
  );
}

// Campos de conexao com o Agrosys: valem para todos os terminais da empresa.
export function AgrosysFields({ values, set }) {
  const field = (name, label, props = {}) => (
    <TextField
      key={name}
      label={label}
      value={values[name] ?? ''}
      onChange={e => set(name, e.target.value)}
      slotProps={{ inputLabel: { shrink: true } }}
      {...props}
    />
  );
  return (
    <>
      {field('con_sincurl', 'URL do web service do Agrosys', { placeholder: 'http://servidor:9080', required: true })}
      {field('emp_empresa', 'Empresa', { type: 'number', required: true })}
      {field('uni_unidade', 'Unidade', { type: 'number', required: true })}
      {field('fil_filial', 'Filial', { type: 'number', required: true })}
      {field('cai_timeout', 'Timeout (ms)', { type: 'number', placeholder: '3000' })}
      <FormControlLabel
        control={
          <Checkbox
            checked={values.cai_urlsoapvr12 === true}
            onChange={e => set('cai_urlsoapvr12', e.target.checked)}
          />
        }
        label="URL SOAP (versão 12)"
      />
    </>
  );
}

// Valores digitados -> padroes de conexao no formato da API do Hub.
export function agrosysDefaults(values) {
  const result = {};
  if (String(values.con_sincurl ?? '').trim()) result.con_sincurl = String(values.con_sincurl).trim();
  for (const key of ['emp_empresa', 'uni_unidade', 'fil_filial', 'cai_timeout'])
    if (String(values[key] ?? '').trim() !== '') result[key] = Number(values[key]);
  result.cai_urlsoapvr12 = values.cai_urlsoapvr12 === true;
  return result;
}

function NewClientDialog({ open, close, done }) {
  const [values, setValues] = useState({ origem: 'api' }),
    [error, setError] = useState(''),
    set = (k, v) => setValues(current => ({ ...current, [k]: v }));
  async function send() {
    setError('');
    try {
      await api('/admin/hub/tenants', {
        method: 'POST',
        body: JSON.stringify({
          nome: values.nome,
          documento: String(values.documento ?? '').replace(/\D/g, '') || undefined,
          origem: values.origem,
          padroes: values.origem === 'agrosys' ? agrosysDefaults(values) : undefined
        })
      });
      setValues({ origem: 'api' });
      done();
    } catch (e) {
      setError(hubError(e).error);
    }
  }
  return (
    <Dialog open={open} onClose={close} fullWidth>
      <DialogTitle>Novo cliente</DialogTitle>
      <DialogContent>
        <Stack spacing={2} mt={1}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Nome" value={values.nome ?? ''} onChange={e => set('nome', e.target.value)} />
          <TextField
            label="CNPJ (opcional)"
            value={maskCnpjInput(values.documento)}
            onChange={e => set('documento', e.target.value)}
            placeholder="00.000.000/0000-00"
          />
          <TextField
            select
            label="Origem da integração"
            value={values.origem}
            onChange={e => set('origem', e.target.value)}
          >
            <MenuItem value="api">API (o sistema do cliente envia ao Hub)</MenuItem>
            <MenuItem value="agrosys">Agrosys (o Hub busca no ERP)</MenuItem>
          </TextField>
          {values.origem === 'agrosys' && <AgrosysFields values={values} set={set} />}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancelar</Button>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          disabled={(values.nome ?? '').trim().length < 2}
          onClick={send}
        >
          Cadastrar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// Hub > Clientes: lista das empresas do usuario; ao abrir uma, mostra terminais, chaves, logs e parametros.
export default function HubClients({ hubMe, notify, segments = [], go }) {
  const [items, setItems] = useState(null),
    [error, setError] = useState(''),
    [creating, setCreating] = useState(false),
    [filter, setFilter] = useState('all'),
    load = useCallback(async () => {
      try {
        // clientes de verdade primeiro; os de homologacao (um por desenvolvedor) ao final
        const list = await api('/admin/hub/tenants');
        setItems([...list].sort((a, b) => Number(a.homologation) - Number(b.homologation)));
        setError('');
      } catch (e) {
        setError(hubError(e).error);
        setItems([]);
      }
    }, []);
  useEffect(() => {
    load();
  }, [load]);

  // /hub/clientes/:id/... abre o cliente; a lista fica em /hub/clientes/
  if (segments[0]) return <HubTenant id={segments[0]} sub={segments.slice(1)} go={go} hubMe={hubMe} />;
  const hasHomologation = (items || []).some(t => t.homologation),
    shown = (items || []).filter(t => filter === 'all' || (filter === 'homologation') === Boolean(t.homologation));
  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      {hubMe && !hubMe.canCreateClient && (
        <Alert severity="info">
          Seu cadastro ainda está em homologação: você já pode usar o cliente de homologação, mas só poderá cadastrar
          clientes depois de homologado.
        </Alert>
      )}
      <Stack direction="row" justifyContent="flex-end">
        <IconAction
          title={hubMe?.canCreateClient ? 'Novo cliente' : 'Novo cliente (disponível após a homologação)'}
          icon={AddIcon}
          disabled={!hubMe?.canCreateClient}
          onClick={() => setCreating(true)}
        />
      </Stack>
      {hasHomologation && (
        <Stack direction="row" spacing={1}>
          {[
            ['all', 'Todos'],
            ['production', 'Produção'],
            ['homologation', 'Homologação']
          ].map(([key, label]) => (
            <Chip
              key={key}
              label={label}
              color={filter === key ? 'primary' : 'default'}
              variant={filter === key ? 'filled' : 'outlined'}
              onClick={() => setFilter(key)}
            />
          ))}
        </Stack>
      )}
      <Grid
        heads={['Cliente', 'Origem da integração', 'Ambiente']}
        rows={shown.map(t => [
          <Button
            key={t.id}
            onClick={() => go(`/hub/clientes/${t.id}/`)}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            {t.nome}
          </Button>,
          origins[t.origem] || t.origem,
          <EnvironmentChip
            key="e"
            homologation={t.homologation}
            owner={hubMe?.role === 'admin' ? t.homologationOwner : null}
          />
        ])}
      />
      <NewClientDialog
        open={creating}
        close={() => setCreating(false)}
        done={() => {
          setCreating(false);
          notify?.('Cliente cadastrado');
          load();
        }}
      />
    </Stack>
  );
}
