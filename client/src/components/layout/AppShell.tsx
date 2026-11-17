
import { useRef, useState, type ReactNode } from 'react';
import {
  AppBar, Avatar, Box, Divider, Drawer, IconButton, List,
  ListItemButton, ListItemIcon, ListItemText, Menu, Toolbar,
  Tooltip, Typography, Button, useTheme,
} from '@mui/material';

import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/SpaceDashboardOutlined';
import PeopleIcon from '@mui/icons-material/PeopleAltOutlined';
import SecurityIcon from '@mui/icons-material/SecurityOutlined';
import HistoryIcon from '@mui/icons-material/HistoryOutlined';
import DarkModeIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeIcon from '@mui/icons-material/LightModeOutlined';

import type { AuthUser } from '../../services/authClient';
import type { Route } from '../../hooks/useHashRoute';

const WIDTH = 240;

interface Props {
  route: Route;
  title: string;
  onToggleMode: () => void;
  children: ReactNode;
  user: AuthUser;
  onLogout: () => void;
}

export default function AppShell({
  route,
  title,
  onToggleMode,
  children,
  user,
  onLogout,
}: Props) {
  const [drawer, setDrawer] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const avatarRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const dark = useTheme().palette.mode === 'dark';

  const initials = user.fullName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const navItems = [
    {
      route: 'dashboard' as Route,
      label: 'Dashboard',
      icon: <DashboardIcon />,
      allowed: user.permissions.includes('dashboard:read') || user.permissions.includes('dashboard:read_self'),
    },
    {
      route: 'employees' as Route,
      label: 'Employees',
      icon: <PeopleIcon />,
      allowed: [
        'employees:read_all',
        'employees:read_department',
        'employees:read_self',
      ].some((permission) => user.permissions.includes(permission)),
    },
    {
      route: 'security' as Route,
      label: 'Security & Sessions',
      icon: <SecurityIcon />,
      allowed: true,
    },
    {
      route: 'audit' as Route,
      label: 'Audit Logs',
      icon: <HistoryIcon />,
      allowed: user.permissions.includes('audit:read'),
    },
  ].filter((item) => item.allowed);

  function navigation() {
    return (
      <Box component="nav" aria-label="Main navigation">
        <Toolbar>
          <Typography variant="h6" color="primary">
            Workforce Analytics
          </Typography>
        </Toolbar>

        <List sx={{ px: 1 }}>
          {navItems.map((item) => (
            <ListItemButton
              key={item.route}
              component="a"
              href={`#/${item.route}`}
              selected={route === item.route}
              onClick={() => setDrawer(false)}
              sx={{ borderRadius: 1, mb: 0.5 }}
            >
              <ListItemIcon sx={{ minWidth: 38 }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          ))}
        </List>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Box
        component="a"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          mainRef.current?.focus();
        }}
        sx={{
          position: 'absolute',
          left: -9999,
          '&:focus': {
            left: 8,
            top: 8,
            zIndex: 2000,
            bgcolor: 'background.paper',
            p: 1,
          },
        }}
      >
        Skip to content
      </Box>

      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          width: WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: WIDTH,
            boxSizing: 'border-box',
          },
        }}
      >
        {navigation()}
      </Drawer>

      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { width: WIDTH },
        }}
      >
        {navigation()}
      </Drawer>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <AppBar
          position="sticky"
          color="inherit"
          elevation={0}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Toolbar sx={{ gap: 1 }}>
            <IconButton
              aria-label="Open navigation"
              edge="start"
              onClick={() => setDrawer(true)}
              sx={{ display: { md: 'none' } }}
            >
              <MenuIcon />
            </IconButton>

            <Typography variant="h6" component="p" sx={{ flex: 1 }}>
              {title}
            </Typography>

            <Tooltip title={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
              <IconButton
                aria-label="Toggle light and dark theme"
                onClick={onToggleMode}
              >
                {dark ? <LightModeIcon /> : <DarkModeIcon />}
              </IconButton>
            </Tooltip>

            <IconButton
              ref={avatarRef}
              aria-label="Open profile menu"
              aria-haspopup="menu"
              onClick={() => setMenuOpen(true)}
            >
              <Avatar
                sx={{
                  width: 32,
                  height: 32,
                  bgcolor: 'secondary.main',
                  fontSize: 14,
                }}
              >
                {initials}
              </Avatar>
            </IconButton>

            <Menu
              anchorEl={avatarRef.current}
              open={menuOpen}
              onClose={() => setMenuOpen(false)}
            >
              <Box sx={{ px: 2, py: 1, maxWidth: 260 }}>
                <Typography fontWeight={600}>
                  {user.fullName}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {user.roles.join(', ')}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  noWrap
                >
                  {user.email}
                </Typography>
              </Box>

              <Divider />

              <Box sx={{ p: 1 }}>
                <Button
                  fullWidth
                  color="error"
                  onClick={() => {
                    setMenuOpen(false);
                    onLogout();
                  }}
                >
                  Sign Out
                </Button>
              </Box>
            </Menu>
          </Toolbar>
        </AppBar>

        <Box
          component="main"
          id="main"
          ref={mainRef}
          tabIndex={-1}
          sx={{
            p: { xs: 2, md: 3 },
            display: 'grid',
            gap: 2,
            outline: 'none',
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}
