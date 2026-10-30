'use client';
import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import {
  Add as AddIcon,
  HowToReg as HowToRegIcon,
  PowerSettingsNew as PowerSettingsNewIcon,
  RemoveCircleOutline as RemoveCircleOutlineIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import { IconAction } from './HubUi';
import { Grid } from './components';
import { maskCnpjInput } from './format';
import { api } from '../../lib/api';
import HubHomologation from './HubHomologation';

const messages = {
  company_required: 'Informe a empresa do player.',
  invalid_cnpj: 'CNPJ inválido.',
  cnpj_not_found: 'CNPJ não encontrado na consulta pública.',
  cnpj_lookup_unavailable: 'A consulta pública de CNPJ está indisponível. Preencha os dados manualmente.',
  invalid_contact_email: 'E-mail de contato inválido.',
  username_taken: 'Já existe um player com este login.',
  password_too_short: 'A senha precisa ter pelo menos 8 caracteres.',
  hub_not_configured: 'O Hub não está configurado no servidor (HUB_API_URL e HUB_SERVICE_KEY).',
  hub_unreachable: 'Não foi possível falar com a API do Hub.'
};
const explain = e => messages[e.message] || e.message;
const maskCnpj = maskCnpjInput;

export function HubUsers({ items, create, done }) {
  const [checking, setChecking] = useState(null);
  async function patch(u, body, text) {
    try {
      await api(`/admin/hub/users/${u.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      done(text);
    } catch (e) {
      done(explain(e));
    }
  }
  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="flex-end">
        <IconAction title="Novo player" icon={AddIcon} onClick={create} />
      </Stack>
      <Grid
        heads={['Nome', 'Login', 'Empresa', 'CNPJ', 'Contato', 'Clientes', 'Homologação', 'Situação']}
        rows={items.map(u => [
          u.name,
          u.username,
          u.company || (u.homologationTenantId ? 'Cliente de homologação' : 'Vinculado a cliente'),
          u.document ? maskCnpj(u.document) : '-',
          [u.contactName, u.contactEmail, u.contactPhone].filter(Boolean).join(' · ') || '-',
          u.clients,
          u.homologationTenantId ? (
            <Box key={`h${u.id}`} sx={{ display: 'flex', alignItems: 'center' }}>
              <IconAction
                title={u.homologated ? 'Revogar homologação' : 'Homologar'}
                icon={u.homologated ? RemoveCircleOutlineIcon : HowToRegIcon}
                color={u.homologated ? 'error' : 'primary'}
                onClick={() => {
                  if (!u.homologated) return setChecking(u);
                  if (window.confirm(`Revogar a homologação de ${u.name}? Ele deixa de poder cadastrar clientes.`))
                    patch(u, { homologated: false }, 'Homologação revogada');
                }}
              />
              {u.homologated && u.approvedMissing > 0 && (
                <Chip
                  size="small"
                  color="warning"
                  variant="outlined"
                  label={`${u.approvedMissing} pendência(s)`}
                  sx={{ ml: 1 }}
                />
              )}
            </Box>
          ) : (
            '-'
          ),
          <IconAction
            key={`a${u.id}`}
            title={u.active ? 'Desativar player' : 'Ativar player'}
            icon={PowerSettingsNewIcon}
            color={u.active ? 'primary' : 'inherit'}
            onClick={() => patch(u, { active: !u.active }, 'Player atualizado')}
          />
        ])}
      />
      {checking && (
        <HubHomologation
          user={checking}
          close={() => setChecking(null)}
          done={text => {
            setChecking(null);
            done(text);
          }}
        />
      )}
      {items.some(u => u.homologationTenantId && !u.homologated) && (
        <Chip
          size="small"
          color="warning"
          label="Há players aguardando homologação"
          sx={{ alignSelf: 'flex-start' }}
        />
      )}
    </Stack>
  );
}

const empty = {
  document: '',
  company: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  name: '',
  username: '',
  password: ''
};

export function HubUserDialog({ open, close, done }) {
  const [form, setForm] = useState(empty),
    [error, setError] = useState(''),
    [info, setInfo] = useState(''),
    [searching, setSearching] = useState(false),
    set = (k, v) => setForm(current => ({ ...current, [k]: v }));

  // Consulta publica de CNPJ: preenche empresa e contato (o que ja foi digitado nao e apagado).
  async function lookup() {
    setError('');
    setInfo('');
    setSearching(true);
    try {
      const d = await api(`/admin/hub/cnpj/${encodeURIComponent(form.document.replace(/\D/g, ''))}`);
      setForm(current => ({
        ...current,
        company: current.company || d.tradeName || d.legalName,
        contactEmail: current.contactEmail || d.email,
        contactPhone: current.contactPhone || d.phone
      }));
      setInfo(`${d.legalName}${d.city ? ` · ${d.city}/${d.state}` : ''}${d.status ? ` · ${d.status}` : ''}`);
    } catch (e) {
      setError(explain(e));
    }
    setSearching(false);
  }

  async function send() {
    setError('');
    try {
      await api('/admin/hub/users', { method: 'POST', body: JSON.stringify(form) });
      setForm(empty);
      setInfo('');
      done();
    } catch (e) {
      setError(explain(e));
    }
  }
  const digits = form.document.replace(/\D/g, ''),
    missing = [
      digits.length !== 14 && 'CNPJ (14 dígitos)',
      !form.company.trim() && 'Empresa',
      !form.name.trim() && 'Nome do player',
      !form.username.trim() && 'Login',
      form.password.length < 8 && 'Senha (mínimo 8 caracteres)'
    ].filter(Boolean);
  return (
    <Dialog open={open} onClose={close} fullWidth>
      <DialogTitle>Novo player do Hub</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 1 }}>
          O player recebe um cliente de homologação no Hub com os dados da empresa. Só depois de homologado ele
          poderá cadastrar clientes.
        </DialogContentText>
        <Stack spacing={2} mt={1}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography variant="subtitle2">Empresa</Typography>
          <Stack direction="row" spacing={1}>
            <TextField
              label="CNPJ"
              value={maskCnpj(form.document)}
              onChange={e => set('document', e.target.value)}
              placeholder="00.000.000/0000-00"
              fullWidth
            />
            <Button
              variant="outlined"
              startIcon={<SearchIcon />}
              disabled={digits.length !== 14 || searching}
              onClick={lookup}
            >
              {searching ? 'Consultando…' : 'Consultar'}
            </Button>
          </Stack>
          {info && <Alert severity="success">{info}</Alert>}
          <TextField label="Empresa" value={form.company} onChange={e => set('company', e.target.value)} />
          <Typography variant="subtitle2">Contato</Typography>
          <TextField
            label="Nome do contato"
            value={form.contactName}
            onChange={e => set('contactName', e.target.value)}
          />
          <TextField
            label="E-mail do contato"
            type="email"
            value={form.contactEmail}
            onChange={e => set('contactEmail', e.target.value)}
          />
          <TextField label="Telefone" value={form.contactPhone} onChange={e => set('contactPhone', e.target.value)} />
          <Typography variant="subtitle2">Acesso</Typography>
          <TextField label="Nome do player" value={form.name} onChange={e => set('name', e.target.value)} />
          <TextField label="Login" value={form.username} onChange={e => set('username', e.target.value)} />
          {missing.length > 0 && (
            <Typography variant="caption" color="text.secondary">
              Falta preencher: {missing.join(', ')}.
            </Typography>
          )}
          <TextField
            label="Senha (mínimo 8 caracteres)"
            type="password"
            value={form.password}
            onChange={e => set('password', e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancelar</Button>
        <Button variant="contained" startIcon={<AddIcon />} disabled={missing.length > 0} onClick={send}>
          Cadastrar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
