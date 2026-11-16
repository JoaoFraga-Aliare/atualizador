'use client';
import { useEffect, useState } from 'react';
import { Box, Collapse, Drawer, List, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import {
  BugReport as BugReportIcon,
  Business as BusinessIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  GridView as GridViewIcon,
  RocketLaunch as RocketLaunchIcon,
  VpnKey as VpnKeyIcon,
  Hub as HubIcon,
  LocationCity as LocationCityIcon,
  MenuBook as MenuBookIcon,
  People as PeopleIcon,
  ReceiptLong as ReceiptLongIcon,
  SystemUpdateAlt as SystemUpdateAltIcon
} from '@mui/icons-material';
import { ag } from '../agrosys-tokens';

export const SIDEBAR_WIDTH = 264;

// Itens do menu em arvore; "children" abre um submenu e so aparece o que o usuario pode ver.
export function menuItems(admin, developer = false) {
  // Hub: administrador gerencia os players; o player so enxerga o Hub.
  const hub = [
    {
      id: 'group-hub',
      label: 'Hub',
      icon: HubIcon,
      children: [
        ...(admin ? [{ id: 'hub-users', label: 'Players', icon: PeopleIcon }] : []),
        { id: 'hub-clients', label: 'Clientes', icon: BusinessIcon },
        { id: 'hub-cities', label: 'Cidades', icon: LocationCityIcon },
        ...(admin ? [{ id: 'hub-logs', label: 'Logs', icon: ReceiptLongIcon }] : []),
        { id: 'hub-docs', label: 'Documentação', icon: MenuBookIcon }
      ]
    }
  ];
  if (developer) return hub;
  return [
    { id: 'home', label: 'Início', icon: GridViewIcon },
    {
      id: 'group-update',
      label: 'Atualização',
      icon: SystemUpdateAltIcon,
      children: [
        { id: 'clients', label: 'Clientes', icon: BusinessIcon },
        {
          id: 'group-releases',
          label: 'Versão',
          icon: RocketLaunchIcon,
          children: [
            { id: 'releases', label: 'Liberadas' },
            { id: 'ci', label: 'CI/CD' },
            { id: 'products', label: 'Produtos' }
          ]
        },
        { id: 'logs-errors', label: 'Logs / Erros', icon: BugReportIcon },
        {
          id: 'group-permission',
          label: 'Permissão',
          icon: VpnKeyIcon,
          children: [...(admin ? [{ id: 'users', label: 'Usuário' }] : []), { id: 'tokens', label: 'Token' }]
        }
      ]
    },
    ...hub
  ];
}

// Caminho de rotulos ate a tela (ex.: Atualizacao · Versao · Liberadas); vazio se nao existir.
function pathTo(items, view) {
  for (const item of items) {
    if (item.id === view) return [item.label];
    const below = item.children && pathTo(item.children, view);
    if (below) return [item.label, ...below];
  }
  return null;
}
const groupsOpenFor = (items, view) =>
  items.flatMap(i => (i.children && pathTo(i.children, view) ? [i.id, ...groupsOpenFor(i.children, view)] : []));

export function viewTitle(view, admin, developer) {
  return pathTo(menuItems(admin, developer), view)?.join(' · ') || '';
}

const itemSx = active => ({
  borderRadius: `${ag.raio}px`,
  mb: 0.25,
  py: 0.9,
  color: active ? '#fff' : '#d3e6ec',
  bgcolor: active ? 'rgba(255,255,255,.11)' : 'transparent',
  boxShadow: active ? `inset 3px 0 0 ${ag.ciano}` : 'none',
  '& .MuiListItemIcon-root': { color: active ? ag.ciano : 'inherit', minWidth: 38 },
  '&:hover': { bgcolor: active ? 'rgba(255,255,255,.11)' : 'rgba(255,255,255,.08)', color: '#fff' },
  '&.Mui-selected, &.Mui-selected:hover': { bgcolor: 'rgba(255,255,255,.11)' }
});

function Node({ item, depth, view, open, toggle, onSelect }) {
  const Icon = item.icon,
    text = { fontWeight: 600, fontSize: depth ? 13.5 : 14 };
  if (!item.children)
    return (
      <ListItemButton selected={view === item.id} sx={itemSx(view === item.id)} onClick={() => onSelect(item.id)}>
        {Icon && (
          <ListItemIcon>
            <Icon fontSize="small" />
          </ListItemIcon>
        )}
        <ListItemText primary={item.label} primaryTypographyProps={text} />
      </ListItemButton>
    );
  const hasActive = Boolean(pathTo(item.children, view));
  return (
    <Box sx={{ mb: 0.25 }}>
      <ListItemButton sx={itemSx(false)} onClick={() => toggle(item.id)}>
        {Icon && (
          <ListItemIcon sx={hasActive ? { color: `${ag.ciano} !important` } : undefined}>
            <Icon fontSize="small" />
          </ListItemIcon>
        )}
        <ListItemText
          primary={item.label}
          primaryTypographyProps={{ ...text, color: hasActive ? '#fff' : 'inherit' }}
        />
        {open[item.id] ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
      </ListItemButton>
      <Collapse in={Boolean(open[item.id])} timeout="auto" unmountOnExit>
        <List disablePadding sx={{ ml: 2.5, pl: 1, borderLeft: '1px solid rgba(255,255,255,.14)' }}>
          {item.children.map(child => (
            <Node
              key={child.id}
              item={child}
              depth={depth + 1}
              view={view}
              open={open}
              toggle={toggle}
              onSelect={onSelect}
            />
          ))}
        </List>
      </Collapse>
    </Box>
  );
}

// Menu compacto: os grupos vem recolhidos; so abre o caminho da tela atual.
function Content({ view, admin, developer, onSelect }) {
  const items = menuItems(admin, developer),
    // Compacto: so abre o caminho da tela atual (o desenvolvedor, que so tem o Hub, ja o ve aberto).
    initial = () =>
      Object.fromEntries(
        [...groupsOpenFor(items, view), ...(developer ? items.map(i => i.id) : [])].map(id => [id, true])
      ),
    [open, setOpen] = useState(initial),
    toggle = id => setOpen(current => ({ ...current, [id]: !current[id] }));
  // Ao trocar de tela, abre os grupos do caminho dela.
  useEffect(() => {
    const ids = groupsOpenFor(items, view);
    if (ids.length) setOpen(current => ({ ...current, ...Object.fromEntries(ids.map(id => [id, true])) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: ag.navy }}>
      <Box
        sx={{
          mx: 1.5,
          height: 72,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid rgba(255,255,255,.12)'
        }}
      >
        <Box component="img" src="/logo-agrosys.svg" alt="Agrosys by aliare" sx={{ width: 138, height: 'auto' }} />
      </Box>
      <List sx={{ px: 1.5, py: 1, overflowY: 'auto', flex: 1 }} component="nav" aria-label="Menu principal">
        {items.map(item => (
          <Node key={item.id} item={item} depth={0} view={view} open={open} toggle={toggle} onSelect={onSelect} />
        ))}
      </List>
    </Box>
  );
}

export default function Sidebar({ view, admin, developer, onSelect, open, onClose }) {
  return (
    <Drawer
      variant="temporary"
      open={open}
      onClose={onClose}
      sx={{ '& .MuiDrawer-paper': { width: SIDEBAR_WIDTH, border: 0, bgcolor: ag.navy, boxShadow: ag.sombraAlta } }}
    >
      <Content view={view} admin={admin} developer={developer} onSelect={onSelect} />
    </Drawer>
  );
}
