import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import AppBar from '@mui/material/AppBar';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import { useTheme } from '@mui/material/styles';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';
import { primaryNavItems, secondaryNavItems } from './navigation.ts';
import { OfflineBanner } from './OfflineBanner.tsx';

const DRAWER_WIDTH = 220;

type Props = {
  userName: string;
  onLogout: () => void;
  children: ReactNode;
};

/**
 * 全ページ共通の骨格。スマホは AppBar + BottomNavigation、PC は permanent Drawer。ページ自体は共通。
 */
export function AppShell({ userName, onLogout, children }: Props) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const activeIndex = primaryNavItems.findIndex((item) =>
    item.to === '/' ? pathname === '/' : pathname.startsWith(item.to ?? ''),
  );

  const accountMenu = (
    <>
      <IconButton
        color="inherit"
        aria-label="アカウントメニュー"
        onClick={(e) => setMenuAnchor(e.currentTarget)}
      >
        <AccountCircleIcon />
      </IconButton>
      <Menu anchorEl={menuAnchor} open={menuAnchor !== null} onClose={() => setMenuAnchor(null)}>
        <MenuItem disabled>{userName}</MenuItem>
        <Divider />
        {secondaryNavItems.map((item) => (
          <MenuItem
            key={item.to}
            onClick={() => {
              setMenuAnchor(null);
              navigate({ to: item.to });
            }}
          >
            {item.label}
          </MenuItem>
        ))}
        <Divider />
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            onLogout();
          }}
        >
          ログアウト
        </MenuItem>
      </Menu>
    </>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh' }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }} enableColorOnDark>
        <Toolbar>
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
            LifeHub
          </Typography>
          {accountMenu}
        </Toolbar>
      </AppBar>

      {isDesktop && (
        <Drawer
          variant="permanent"
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
          }}
        >
          <Toolbar />
          <List component="nav">
            {primaryNavItems.map((item, index) => (
              <ListItem key={item.to} disablePadding>
                <ListItemButton component={Link} to={item.to} selected={index === activeIndex}>
                  <ListItemIcon>
                    <item.icon />
                  </ListItemIcon>
                  <ListItemText primary={item.label} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Drawer>
      )}

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          px: 2,
          py: 2,
          pb: isDesktop ? 2 : 'calc(56px + env(safe-area-inset-bottom) + 16px)',
        }}
      >
        <Toolbar />
        <OfflineBanner />
        {children}
      </Box>

      {!isDesktop && (
        <Paper
          component="nav"
          elevation={3}
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            pb: 'env(safe-area-inset-bottom)',
            zIndex: (t) => t.zIndex.appBar,
          }}
        >
          <BottomNavigation value={activeIndex} showLabels>
            {primaryNavItems.map((item) => (
              <BottomNavigationAction
                key={item.to}
                label={item.label}
                icon={<item.icon />}
                component={Link}
                to={item.to}
              />
            ))}
          </BottomNavigation>
        </Paper>
      )}
    </Box>
  );
}
