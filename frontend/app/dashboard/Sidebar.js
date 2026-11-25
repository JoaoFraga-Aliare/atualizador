'use client';
import { useEffect, useState } from 'react';
import { Box, Collapse, Drawer, List, ListItemButton, ListItemIcon, ListItemText, Tooltip } from '@mui/material';
import {
  BugReportOutlined as BugReportIcon,
  BusinessOutlined as BusinessIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  GridViewOutlined as GridViewIcon,
  RocketLaunchOutlined as RocketLaunchIcon,
  VpnKeyOutlined as VpnKeyIcon,
  HubOutlined as HubIcon,
  LocationCityOutlined as LocationCityIcon,
  MenuBookOutlined as MenuBookIcon,
  PeopleOutlined as PeopleIcon,
  ReceiptLongOutlined as ReceiptLongIcon,
  SystemUpdateAltOutlined as SystemUpdateAltIcon
} from '@mui/icons-material';
import { ag } from '../agrosys-tokens';

export const SIDEBAR_WIDTH = 240;
export const SIDEBAR_MINI_WIDTH = 72;
// Mesma chave do kit agrosys-ui (menu.js), para lembrar a escolha entre visitas.
const STORAGE_KEY = 'agrosys-ui.menuRecolhido';

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

// Padrao do kit: secoes em ciano no topo de cada bloco. Os grupos de 1o nivel viram secao
// e o item solto (Inicio) fica em "Principal".
function sectionsOf(items) {
  const sections = [];
  const loose = items.filter(i => !i.children);
  if (loose.length) sections.push({ id: 'main', label: 'Principal', items: loose });
  items.filter(i => i.children).forEach(g => sections.push({ id: g.id, label: g.label, items: g.children }));
  return sections;
}

const itemSx = (active, mini) => ({
  borderRadius: `${ag.raio}px`,
  mb: 0.25,
  py: 0.9,
  px: mini ? 0 : 1.5,
  justifyContent: mini ? 'center' : 'flex-start',
  color: active ? '#fff' : '#d3e6ec',
  bgcolor: active ? 'rgba(255,255,255,.11)' : 'transparent',
  boxShadow: active ? `inset 3px 0 0 ${ag.ciano}` : 'none',
  '& .MuiListItemIcon-root': { color: active ? ag.ciano : 'inherit', minWidth: mini ? 0 : 38 },
  '&:hover': { bgcolor: active ? 'rgba(255,255,255,.11)' : 'rgba(255,255,255,.08)', color: '#fff' },
  '&.Mui-selected, &.Mui-selected:hover': { bgcolor: 'rgba(255,255,255,.11)' }
});

function Node({ item, depth, view, open, toggle, onSelect, mini, expand }) {
  const Icon = item.icon,
    text = { fontWeight: 500, fontSize: 13.5, noWrap: true },
    icon = Icon && (
      <ListItemIcon>
        <Icon fontSize="small" />
      </ListItemIcon>
    );
  if (!item.children) {
    const button = (
      <ListItemButton
        selected={view === item.id}
        aria-label={item.label}
        aria-current={view === item.id ? 'page' : undefined}
        sx={itemSx(view === item.id, mini)}
        onClick={() => onSelect(item.id)}
      >
        {icon}
        {!mini && <ListItemText primary={item.label} primaryTypographyProps={text} />}
      </ListItemButton>
    );
    return mini ? (
      <Tooltip title={item.label} placement="right">
        {button}
      </Tooltip>
    ) : (
      button
    );
  }
  const hasActive = Boolean(pathTo(item.children, view)),
    button = (
      <ListItemButton
        aria-label={item.label}
        sx={itemSx(false, mini)}
        onClick={() => {
          // Recolhido nao tem onde abrir o submenu: expande o menu e abre o grupo.
          if (mini) expand();
          toggle(item.id, mini);
        }}
      >
        {Icon && (
          <ListItemIcon sx={hasActive ? { color: `${ag.ciano} !important` } : undefined}>
            <Icon fontSize="small" />
          </ListItemIcon>
        )}
        {!mini && (
          <>
            <ListItemText
              primary={item.label}
              primaryTypographyProps={{ ...text, color: hasActive ? '#fff' : 'inherit' }}
            />
            {open[item.id] ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </>
        )}
      </ListItemButton>
    );
  return (
    <Box sx={{ mb: 0.25 }}>
      {mini ? (
        <Tooltip title={item.label} placement="right">
          {button}
        </Tooltip>
      ) : (
        button
      )}
      {!mini && (
        <Collapse in={Boolean(open[item.id])} timeout="auto" unmountOnExit>
          <List disablePadding sx={{ ml: 2.5, pl: 1 }}>
            {item.children.map(child => (
              <Node
                key={child.id}
                item={child}
                depth={depth + 1}
                view={view}
                open={open}
                toggle={toggle}
                onSelect={onSelect}
                mini={mini}
                expand={expand}
              />
            ))}
          </List>
        </Collapse>
      )}
    </Box>
  );
}

// Menu compacto: os grupos vem recolhidos; so abre o caminho da tela atual.
function Content({ view, admin, developer, onSelect, mini, onToggleMini }) {
  const items = menuItems(admin, developer),
    sections = sectionsOf(items),
    // Compacto: so abre o caminho da tela atual.
    initial = () => Object.fromEntries(groupsOpenFor(items, view).map(id => [id, true])),
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
          mx: mini ? 1.25 : 1.5,
          height: 72,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid rgba(255,255,255,.12)'
        }}
      >
        <Box
          component="img"
          src={mini ? '/logo-agrosys-marca.svg' : '/logo-agrosys.svg'}
          alt="Agrosys by aliare"
          sx={{ width: mini ? 30 : 138, height: 'auto' }}
        />
      </Box>
      <Box
        component="nav"
        aria-label="Menu principal"
        sx={{ px: mini ? 1.25 : 1.5, py: 0.5, overflowY: 'auto', overflowX: 'hidden', flex: 1 }}
      >
        {sections.map(section => (
          <Box key={section.id}>
            {mini ? (
              <Box sx={{ borderTop: '1px solid rgba(255,255,255,.15)', mx: 1, mt: 1.5, mb: 1 }} />
            ) : (
              <Box
                sx={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                  color: ag.ciano,
                  px: 1.5,
                  pt: 2,
                  pb: 0.75,
                  whiteSpace: 'nowrap'
                }}
              >
                {section.label}
              </Box>
            )}
            <List disablePadding>
              {section.items.map(item => (
                <Node
                  key={item.id}
                  item={item}
                  depth={0}
                  view={view}
                  open={open}
                  toggle={toggle}
                  onSelect={onSelect}
                  mini={mini}
                  expand={onToggleMini && mini ? onToggleMini : () => {}}
                />
              ))}
            </List>
          </Box>
        ))}
      </Box>
      {onToggleMini && (
        <Box sx={{ px: mini ? 1.25 : 1.5, pb: 1.5 }}>
          <Tooltip title={mini ? 'Expandir menu' : ''} placement="right">
            <ListItemButton
              aria-label={mini ? 'Expandir menu' : 'Recolher menu'}
              aria-expanded={!mini}
              onClick={onToggleMini}
              sx={{
                ...itemSx(false, mini),
                color: '#9cc0cc',
                borderTop: '1px solid rgba(255,255,255,.12)',
                borderRadius: `0 0 ${ag.raio}px ${ag.raio}px`,
                pt: 1.5,
                mt: 1
              }}
            >
              <ListItemIcon>{mini ? <ChevronRightIcon fontSize="small" /> : <ChevronLeftIcon fontSize="small" />}</ListItemIcon>
              {!mini && <ListItemText primary="Recolher menu" primaryTypographyProps={{ fontWeight: 500, fontSize: 13.5 }} />}
            </ListItemButton>
          </Tooltip>
        </Box>
      )}
    </Box>
  );
}

// Desktop: menu fixo ao lado, recolhivel para so icones. Mobile: gaveta aberta pelo botao do topo.
export default function Sidebar({ view, admin, developer, onSelect, open, onClose }) {
  const [mini, setMini] = useState(false);
  useEffect(() => {
    try {
      setMini(localStorage.getItem(STORAGE_KEY) === '1');
    } catch {}
  }, []);
  const toggleMini = () =>
    setMini(current => {
      try {
        localStorage.setItem(STORAGE_KEY, current ? '0' : '1');
      } catch {}
      return !current;
    });
  return (
    <>
      <Box
        component="aside"
        sx={{
          display: { xs: 'none', md: 'block' },
          width: mini ? SIDEBAR_MINI_WIDTH : SIDEBAR_WIDTH,
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          height: '100vh',
          transition: 'width .2s ease',
          overflow: 'hidden',
          bgcolor: ag.navy,
          borderRight: '1px solid rgba(255,255,255,.08)'
        }}
      >
        <Content view={view} admin={admin} developer={developer} onSelect={onSelect} mini={mini} onToggleMini={toggleMini} />
      </Box>
      <Drawer
        variant="temporary"
        open={open}
        onClose={onClose}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { width: SIDEBAR_WIDTH, border: 0, bgcolor: ag.navy, boxShadow: ag.sombraAlta }
        }}
      >
        <Content view={view} admin={admin} developer={developer} onSelect={onSelect} mini={false} />
      </Drawer>
    </>
  );
}
