'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AppBar, Box, Button, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Toolbar, Typography,
} from '@mui/material';
import {
  AccountCircle as AccountCircleIcon, Business as BusinessIcon, Logout as LogoutIcon,
  MenuBook as MenuBookIcon, MoreVert as MoreVertIcon,
} from '@mui/icons-material';

// Mesmo desenho da Central de Atualização: barra superior translúcida, menu em
// gaveta com o logo e itens com destaque verde no ativo.
export const SIDEBAR_WIDTH = 264;

const itens = [
  { href: '/tenants', rotulo: 'Empresas', icone: BusinessIcon },
  { href: '/docs', rotulo: 'Documentação', icone: MenuBookIcon },
];

const itemSx = (ativo: boolean) => ({
  borderRadius: 2, mb: 0.25, py: 0.9,
  color: ativo ? 'primary.dark' : 'text.secondary',
  bgcolor: ativo ? 'primary.light' : 'transparent',
  '& .MuiListItemIcon-root': { color: ativo ? 'primary.main' : '#98a2b3', minWidth: 38 },
  '&:hover': { bgcolor: ativo ? 'primary.light' : '#f2f4f7' },
});

export function Shell({ nome, papel, sair, children }: {
  nome: string; papel: string; sair: () => Promise<void>; children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const caminho = usePathname();
  const ativo = (href: string) => caminho === href || caminho.startsWith(href + '/');
  const titulo = itens.find((i) => ativo(i.href))?.rotulo ?? 'Hub de Integração';

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Drawer
        open={aberto}
        onClose={() => setAberto(false)}
        sx={{ '& .MuiDrawer-paper': { width: SIDEBAR_WIDTH, border: 0, boxShadow: '0 24px 56px rgba(16,24,40,.18)' } }}
      >
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#fff' }}>
          <Box sx={{ px: 2.5, height: 72, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
            <Box component="img" src="/logo.svg" alt="Logo" sx={{ height: 38, width: 'auto', maxWidth: '100%' }} />
          </Box>
          <List sx={{ px: 1.5, py: 1, flex: 1 }} component="nav" aria-label="Menu principal">
            {itens.map(({ href, rotulo, icone: Icone }) => (
              <ListItemButton key={href} component={Link} href={href} selected={ativo(href)} sx={itemSx(ativo(href))}
                onClick={() => setAberto(false)}>
                <ListItemIcon><Icone fontSize="small" /></ListItemIcon>
                <ListItemText primary={rotulo} primaryTypographyProps={{ fontWeight: 600, fontSize: 14 }} />
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Drawer>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <AppBar position="sticky" color="inherit" elevation={0}>
          <Toolbar sx={{ gap: 1 }}>
            <IconButton edge="start" aria-label="Abrir menu" onClick={() => setAberto((a) => !a)}>
              <MoreVertIcon />
            </IconButton>
            <Typography sx={{ flex: 1, fontWeight: 700, letterSpacing: '-.01em' }}>{titulo}</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1 }}>
              <AccountCircleIcon sx={{ color: 'text.secondary' }} />
              <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                <Typography variant="body2" fontWeight={700} lineHeight={1.2}>{nome}</Typography>
                <Typography variant="caption" color="text.secondary">{papel}</Typography>
              </Box>
            </Box>
            <form action={sair}>
              <Button type="submit" color="inherit" startIcon={<LogoutIcon />}>Sair</Button>
            </form>
          </Toolbar>
        </AppBar>
        <Box sx={{ maxWidth: 1600, mx: 'auto', px: { xs: 2, md: 4 }, py: { xs: 2.5, md: 4 } }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
