'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { BackHome, Grid } from './components';
import { allChannels, channels } from './format';
import { api } from '../../lib/api';

// Busca das listas de usuarios: filtra ao digitar (nome, login, e-mail), sem diferenciar acentos nem maiusculas.
const plain = text =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

function useSearch(items, textOf) {
  const [search, setSearch] = useState('');
  const shown = useMemo(() => {
    const term = plain(search).trim();
    return term ? items.filter(item => plain(textOf(item)).includes(term)) : items;
  }, [items, search]); // eslint-disable-line react-hooks/exhaustive-deps
  return { search, setSearch, shown };
}

function SearchField({ search, setSearch, shown, total, noun }) {
  return (
    <TextField
      size="small"
      type="search"
      label="Buscar por nome, login ou e-mail"
      value={search}
      onChange={e => setSearch(e.target.value)}
      helperText={search.trim() ? `${shown} de ${total} ${noun}` : `${total} ${noun}`}
      inputProps={{ 'aria-label': 'Buscar usuário' }}
      sx={{ maxWidth: 420 }}
    />
  );
}

const roleLabel = role => (role === 'admin' ? 'Administrador' : 'Usuário limitado');

export function Users({ items, products = [], create, done }) {
  // quais logins estao ligados (AUTH_MODO): a lista do Agrosys so aparece com o login Agrosys ligado
  const [modes, setModes] = useState({ local: true, zitadel: false });
  useEffect(() => {
    api('/auth/modes')
      .then(setModes)
      .catch(() => {});
  }, []);
  const { search, setSearch, shown } = useSearch(items, u => `${u.name} ${u.username}`);

  async function toggle(u) {
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ active: !u.active }) });
      done('Usuário atualizado');
    } catch (e) {
      done(e.message);
    }
  }
  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between">
        {modes.local ? (
          <Button variant="contained" onClick={create}>
            Novo usuário
          </Button>
        ) : (
          <span />
        )}
        <BackHome />
      </Stack>
      {modes.zitadel && <AgrosysUsers products={products} done={done} />}
      {modes.local && (
        <Stack spacing={1.5}>
          {modes.zitadel && <Typography variant="h6">Usuários locais</Typography>}
          <SearchField search={search} setSearch={setSearch} shown={shown.length} total={items.length} noun="usuários" />
          <Grid
            heads={['Nome', 'Login', 'Perfil', 'Produtos', 'Canais', 'Situação']}
            rows={shown.map(u => [
              u.name,
              u.username,
              u.role,
              u.products || 'Todos',
              u.channels || 'Todos',
              <Button key={u.id} onClick={() => toggle(u)}>
                {u.active ? 'Desativar' : 'Ativar'}
              </Button>
            ])}
          />
        </Stack>
      )}
    </Stack>
  );
}

// Pessoas cadastradas no Agrosys (Zitadel). As permissoes sao gravadas na central e valem no painel assim que a pessoa entra
// (imediatamente, se ela ja tinha entrado antes).
function AgrosysUsers({ products, done }) {
  const [list, setList] = useState(null),
    [error, setError] = useState(''),
    [editing, setEditing] = useState(null);
  const { search, setSearch, shown } = useSearch(list ?? [], u => `${u.name} ${u.username} ${u.email}`);
  async function load() {
    try {
      setList(await api('/admin/zitadel/users'));
      setError('');
    } catch (e) {
      setList([]);
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <Stack spacing={1.5}>
      <Typography variant="h6">Usuários Agrosys</Typography>
      <Typography variant="body2" color="text.secondary">
        Quem entra pelo Agrosys. As permissões são gravadas na central e valem para a pessoa neste painel.
      </Typography>
      {error && <Alert severity="error">Não foi possível carregar os usuários do Agrosys: {error}</Alert>}
      {list && !error && (
        <>
          <SearchField search={search} setSearch={setSearch} shown={shown.length} total={list.length} noun="pessoas" />
          <Grid
            heads={['Nome', 'E-mail', 'Perfil', 'Produtos', 'Canais', '']}
            rows={shown.map(u => [
              u.active ? u.name : `${u.name} (inativo)`,
              u.email || u.username,
              roleLabel(u.role),
              u.role === 'admin' ? 'Todos' : u.products.join(', ') || 'Nenhum',
              u.role === 'admin' ? 'Todos' : u.channels.join(', ') || 'Nenhum',
              <Button key={u.id} size="small" onClick={() => setEditing(u)}>
                Editar
              </Button>
            ])}
          />
        </>
      )}
      {editing && (
        <AgrosysUserDialog
          user={editing}
          products={products}
          close={() => setEditing(null)}
          saved={async () => {
            setEditing(null);
            await load();
            done('Permissões salvas');
          }}
        />
      )}
    </Stack>
  );
}

const messages = {
  cannot_remove_own_admin: 'Você não pode remover o seu próprio acesso de administrador.',
  scope_required: 'Escolha ao menos um produto e um canal.',
  invalid_product: 'Produto inválido.',
  invalid_channel: 'Canal inválido.',
  zitadel_disabled: 'O login pelo Agrosys não está ligado neste servidor.'
};

function AgrosysUserDialog({ user, products, close, saved }) {
  const [form, setForm] = useState({ role: user.role, productIds: user.productIds, channels: user.channels }),
    [error, setError] = useState(''),
    set = (key, value) => setForm({ ...form, [key]: value }),
    incomplete = form.role === 'operator' && (!form.productIds.length || !form.channels.length);
  async function send() {
    setError('');
    try {
      await api(`/admin/zitadel/users/${user.id}`, { method: 'PUT', body: JSON.stringify(form) });
      await saved();
    } catch (e) {
      setError(messages[e.message] || e.message);
    }
  }
  return (
    <Dialog open onClose={close} fullWidth>
      <DialogTitle>Permissões de {user.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} mt={1}>
          <Alert severity="info">As permissões são gravadas na central (Zitadel). Quem já entrou antes recebe na hora; quem ainda não entrou, no primeiro login.</Alert>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="E-mail" value={user.email || user.username || ''} disabled />
          <FormControl>
            <InputLabel>Perfil</InputLabel>
            <Select label="Perfil" value={form.role} onChange={e => set('role', e.target.value)}>
              <MenuItem value="operator">Usuário limitado</MenuItem>
              <MenuItem value="admin">Administrador</MenuItem>
            </Select>
          </FormControl>
          {form.role === 'operator' && (
            <>
              <FormControl>
                <InputLabel>Produtos</InputLabel>
                <Select
                  multiple
                  label="Produtos"
                  value={form.productIds}
                  onChange={e => set('productIds', e.target.value)}
                >
                  {products.map(p => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <InputLabel>Canais</InputLabel>
                <Select multiple label="Canais" value={form.channels} onChange={e => set('channels', e.target.value)}>
                  {allChannels.map(c => (
                    <MenuItem key={c} value={c}>
                      {c}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancelar</Button>
        <Button variant="contained" disabled={incomplete} onClick={send}>
          Salvar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function UserDialog({ open, close, products, done }) {
  const [form, setForm] = useState({
      name: '',
      username: '',
      password: '',
      role: 'operator',
      productIds: [],
      channels: []
    }),
    set = (k, v) => setForm({ ...form, [k]: v });
  async function send() {
    await api('/admin/users', { method: 'POST', body: JSON.stringify(form) });
    done();
  }
  return (
    <Dialog open={open} onClose={close} fullWidth>
      <DialogTitle>Novo usuário</DialogTitle>
      <DialogContent>
        <Stack spacing={2} mt={1}>
          <TextField label="Nome" value={form.name} onChange={e => set('name', e.target.value)} />
          <TextField label="Login" value={form.username} onChange={e => set('username', e.target.value)} />
          <TextField
            label="Senha (mínimo 8 caracteres)"
            type="password"
            value={form.password}
            onChange={e => set('password', e.target.value)}
          />
          <FormControl>
            <InputLabel>Perfil</InputLabel>
            <Select label="Perfil" value={form.role} onChange={e => set('role', e.target.value)}>
              <MenuItem value="operator">Usuário limitado</MenuItem>
              <MenuItem value="admin">Administrador</MenuItem>
            </Select>
          </FormControl>
          {form.role === 'operator' && (
            <>
              <FormControl>
                <InputLabel>Produtos</InputLabel>
                <Select
                  multiple
                  label="Produtos"
                  value={form.productIds}
                  onChange={e => set('productIds', e.target.value)}
                >
                  {products.map(p => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <InputLabel>Canais</InputLabel>
                <Select multiple label="Canais" value={form.channels} onChange={e => set('channels', e.target.value)}>
                  {channels.map(c => (
                    <MenuItem key={c} value={c}>
                      {c}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancelar</Button>
        <Button variant="contained" disabled={!form.name || !form.username || form.password.length < 8} onClick={send}>
          Cadastrar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
