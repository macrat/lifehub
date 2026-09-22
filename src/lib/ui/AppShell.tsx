import Alert from '@mui/material/Alert';
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
import Snackbar from '@mui/material/Snackbar';
import Toolbar from '@mui/material/Toolbar';
import { Link, useLocation } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useIsLoadingWithoutCache } from '../query-client.ts';
import { AppBarSlotOutlet, AppBarSlotProvider } from './app-bar-slot.tsx';
import { bottomNavItems, primaryNavItems } from './navigation.ts';
import { notify, useNotice } from './notice.ts';
import { OfflineBanner } from './OfflineBanner.tsx';
import { useIsDesktop } from './use-breakpoint.ts';

const DRAWER_WIDTH = 220;
/** 下部ナビの高さ。ページ側で「画面いっぱい」を計算するときに使う */
export const BOTTOM_NAV_HEIGHT = 56;
/** AppBar（dense）の高さ */
export const APP_BAR_HEIGHT = 48;
/** 右下の追加ボタン（FAB / SpeedDial）の位置。スマホでは下部ナビの上に置く */
export const FAB_SX = {
  position: 'fixed',
  right: 16,
  bottom: { xs: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom) + 16px)`, md: 24 },
} as const;

type Props = {
  children: ReactNode;
};

/**
 * 全ページ共通の骨格。画面は主役（各ページの内容）に最大の面積を割く:
 * - ページタイトルは出さない（下部ナビ／サイドナビが現在地を示す）
 * - AppBar は各ページの操作（月の切替、検索など）のための帯（AppBarContent で差し込む）。それ以外は何も置かない
 * - スマホは AppBar + BottomNavigation、PC は permanent Drawer（アプリ名は出さない）。ページ自体は共通。
 * - 設定は PC のサイドナビにだけ置く。スマホではホームの末尾から開く（下部ナビは主要 4 画面に絞る）。
 */
export function AppShell({ children }: Props) {
  const isDesktop = useIsDesktop();
  const { pathname } = useLocation();
  const busy = useIsLoadingWithoutCache();

  const isActive = (to: string | undefined) =>
    to === '/' ? pathname === '/' : pathname.startsWith(to ?? '');
  const bottomIndex = bottomNavItems.findIndex((item) => isActive(item.to));

  return (
    <AppBarSlotProvider>
      {/* 画面いっぱいの基準は svh（ブラウザの URL バーなどが最大に出ている状態の高さ）。
          dvh はそれらの出入りで値が変わり、再読み込みの直後に画面より高くなってスクロールが要る表示になる */}
      <Box sx={{ display: 'flex', minHeight: '100svh' }}>
        <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
          <Toolbar variant="dense" sx={{ pt: 'env(safe-area-inset-top)', gap: 0.5 }}>
            <AppBarSlotOutlet />
          </Toolbar>
          {/* 手元に何も無いまま待っている間だけ出す細いインジケータ（`useIsLoadingWithoutCache`）。
              位置を取らないよう AppBar の下端に重ねる */}
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
            <List component="nav">
              {primaryNavItems.map((item) => (
                <ListItem key={item.to} disablePadding>
                  <ListItemButton component={Link} to={item.to} selected={isActive(item.to)}>
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

        <NoticeSnackbar />

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
            <BottomNavigation value={bottomIndex} showLabels sx={{ height: BOTTOM_NAV_HEIGHT }}>
              {bottomNavItems.map((item) => (
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

/** 保存の失敗などの知らせ。フォームは送信と同時に閉じるので、伝える場所は画面の下部に 1 つだけ置く */
function NoticeSnackbar() {
  const notice = useNotice();
  return (
    <Snackbar
      open={notice !== null}
      autoHideDuration={8000}
      onClose={() => notify(null)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      // スマホでは下部ナビの上に出す
      sx={{
        bottom: {
          xs: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom) + 8px)`,
          md: 24,
        },
      }}
    >
      <Alert severity="error" variant="filled" onClose={() => notify(null)}>
        {notice}
      </Alert>
    </Snackbar>
  );
}
