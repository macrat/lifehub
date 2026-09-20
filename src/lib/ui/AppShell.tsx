import AppBar from '@mui/material/AppBar';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import { useTheme } from '@mui/material/styles';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { Link, useLocation } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { AppBarSlotOutlet, AppBarSlotProvider } from './app-bar-slot.tsx';
import { primaryNavItems } from './navigation.ts';
import { OfflineBanner } from './OfflineBanner.tsx';

const DRAWER_WIDTH = 220;
/** 下部ナビの高さ。ページ側で「画面いっぱい」を計算するときに使う */
export const BOTTOM_NAV_HEIGHT = 56;
/** AppBar（dense）の高さ */
export const APP_BAR_HEIGHT = 48;

type Props = {
  children: ReactNode;
};

/**
 * 全ページ共通の骨格。画面は主役（各ページの内容）に最大の面積を割く:
 * - ページタイトルは出さない（下部ナビ／サイドナビが現在地を示す）
 * - AppBar は各ページの操作（月の切替、検索など）のための帯（AppBarContent で差し込む）。それ以外は何も置かない
 * - スマホは AppBar + BottomNavigation、PC は permanent Drawer。ページ自体は共通。
 */
export function AppShell({ children }: Props) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const { pathname } = useLocation();
  const busy = useIsFetching() + useIsMutating() > 0;

  const activeIndex = primaryNavItems.findIndex((item) =>
    item.to === '/' ? pathname === '/' : pathname.startsWith(item.to ?? ''),
  );

  return (
    <AppBarSlotProvider>
      <Box sx={{ display: 'flex', minHeight: '100dvh' }}>
        <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
          <Toolbar variant="dense" sx={{ pt: 'env(safe-area-inset-top)', gap: 0.5 }}>
            <AppBarSlotOutlet />
          </Toolbar>
          {/* 取得・保存中の細いインジケータ。位置を取らないよう AppBar の下端に重ねる */}
          <LinearProgress
            color="primary"
            sx={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 2,
              opacity: busy ? 0.7 : 0,
              transition: 'opacity .2s',
            }}
          />
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
            <Toolbar variant="dense" />
            <Typography variant="h6" component="div" sx={{ px: 2, pt: 2, pb: 1 }}>
              LifeHub
            </Typography>
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
            // スマホは端まで使う（各部品が自分の内側余白を持つ）。PC は少し余白を取る
            px: { xs: 0, md: 2 },
            pt: { xs: 0, md: 1 },
            // 下部ナビと右下の追加ボタンに最後の内容が隠れないよう余白を取る
            pb: isDesktop
              ? 12
              : `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom) + 96px)`,
          }}
        >
          <Toolbar variant="dense" sx={{ pt: 'env(safe-area-inset-top)' }} />
          <OfflineBanner />
          {children}
        </Box>

        {!isDesktop && (
          <Paper
            component="nav"
            sx={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              pb: 'env(safe-area-inset-bottom)',
              zIndex: (t) => t.zIndex.appBar,
            }}
          >
            <BottomNavigation value={activeIndex} showLabels sx={{ height: BOTTOM_NAV_HEIGHT }}>
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
    </AppBarSlotProvider>
  );
}
