import Alert from '@mui/material/Alert';
import AppBar from '@mui/material/AppBar';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import GlobalStyles from '@mui/material/GlobalStyles';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Snackbar from '@mui/material/Snackbar';
import Toolbar from '@mui/material/Toolbar';
import { createLink, useLocation } from '@tanstack/react-router';
import { type ReactNode, useRef } from 'react';
import { useIsLoadingWithoutCache } from '../screen-data.ts';
import { AppBarSlotOutlet, AppBarSlotProvider } from './app-bar-slot.tsx';
import { scrollToInitialPosition } from './initial-position.ts';
import { BOTTOM_NAV_HEIGHT, BOTTOM_NAV_TOP, MAIN_BOTTOM_PADDING } from './layout.ts';
import type { NavItem } from './nav-item.ts';
import { closeNotice, useNotice } from './notice.ts';
import { OfflineIndicator } from './OfflineIndicator.tsx';
import { PullToRefresh } from './PullToRefresh.tsx';
import { useIsDesktop } from './use-breakpoint.ts';

const DRAWER_WIDTH = 220;

// MUI の部品を router のリンクにする（`component={Link}` では to と search の型が MUI の props の推論に埋もれる）
const ListItemLink = createLink(ListItemButton);
const BottomNavigationLink = createLink(BottomNavigationAction);

type Props = {
  /** ナビに並べる主要画面（`src/navigation.ts`） */
  navItems: NavItem[];
  children: ReactNode;
};

/**
 * 全ページ共通の骨格。画面は主役（各ページの内容）に最大の面積を割く:
 * - ページタイトルは出さない（下部ナビ／サイドナビが現在地を示す）
 * - AppBar は各ページの操作（月の切替、検索など）のための帯（AppBarContent で差し込む）。それ以外はオフラインの印（左端）だけを置く
 * - スマホは AppBar + BottomNavigation、PC は permanent Drawer（アプリ名は出さない）。ページ自体は共通。
 * - 設定は PC のサイドナビにだけ置く。スマホではホームの AppBar の歯車から開く（下部ナビは主要 4 画面に絞る）。
 */
export function AppShell({ navItems, children }: Props) {
  const isDesktop = useIsDesktop();
  const { pathname } = useLocation();
  /** 引っ張って更新で引ける範囲。ダイアログやシートは body に出るのでこの外 */
  const shell = useRef<HTMLDivElement>(null);

  const isActive = (to: string | undefined) =>
    to === '/' ? pathname === '/' : pathname.startsWith(to ?? '');
  // 今いる画面のタブをもう一度押したとき。行き先の検索パラメータが無ければ、画面の最初の位置まで
  // なめらかに戻す。そのときはルーターが移動の後に行うスクロール位置の復元（同じ場所への移動では押した
  // 時点の位置）を止めて（resetScroll: false）、なめらかなスクロールを遮らせない
  const reselectProps = (item: NavItem) => {
    if (!isActive(item.to)) return {};
    if (item.reselectSearch) return { search: item.reselectSearch };
    return { resetScroll: false, onClick: scrollToInitialPosition };
  };
  const bottomNavItems = navItems.filter((item) => !item.desktopOnly);
  const bottomIndex = bottomNavItems.findIndex((item) => isActive(item.to));

  return (
    <AppBarSlotProvider>
      {/* 画面いっぱいの基準は svh（ブラウザの URL バーなどが最大に出ている状態の高さ）。
          dvh はそれらの出入りで値が変わり、再読み込みの直後に画面より高くなってスクロールが要る表示になる */}
      <Box ref={shell} sx={{ display: 'flex', minHeight: '100svh' }}>
        <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
          <Toolbar variant="dense" sx={{ pt: 'env(safe-area-inset-top)', gap: 0.5 }}>
            <OfflineIndicator />
            <AppBarSlotOutlet />
          </Toolbar>
          <TopProgress />
        </AppBar>
        <PullToRefresh area={shell} />

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
              {navItems.map((item) => (
                <ListItem key={item.to} disablePadding>
                  <ListItemLink to={item.to} {...reselectProps(item)} selected={isActive(item.to)}>
                    <ListItemIcon>
                      <item.icon />
                    </ListItemIcon>
                    <ListItemText primary={item.label} />
                  </ListItemLink>
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
            pb: MAIN_BOTTOM_PADDING,
          }}
        >
          <Toolbar variant="dense" sx={{ pt: 'env(safe-area-inset-top)' }} />
          {children}
        </Box>

        <NoticeSnackbar />

        {!isDesktop && (
          // 画面の下端を下部ナビが覆っていることをブラウザに伝える。scrollIntoView などが
          // 要素をナビの裏ではなくそのすぐ上に置く（天気の開いた日を画面に収めるときなど）
          <GlobalStyles
            styles={{
              html: { scrollPaddingBottom: BOTTOM_NAV_TOP },
            }}
          />
        )}
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
                <BottomNavigationLink
                  key={item.to}
                  label={item.label}
                  icon={<item.icon />}
                  to={item.to}
                  {...reselectProps(item)}
                />
              ))}
            </BottomNavigation>
          </Paper>
        )}
      </Box>
    </AppBarSlotProvider>
  );
}

/**
 * 取得を待っていることを伝える細い帯。位置を取らないよう AppBar の下端に重ねる。
 * 取得の状態を読むのはこの部品だけにして、画面の骨格（AppShell）が取得のたびに描き直されないようにする。
 */
function TopProgress() {
  const busy = useIsLoadingWithoutCache();
  return (
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
  );
}

/** 保存の失敗などの知らせ。フォームは送信と同時に閉じるので、伝える場所は画面の下部に 1 つだけ置く */
function NoticeSnackbar() {
  const notice = useNotice();
  return (
    <Snackbar
      open={notice.open}
      autoHideDuration={notice.duration}
      onClose={closeNotice}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      // スマホでは下部ナビの上に出す
      sx={{
        bottom: {
          xs: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom) + 8px)`,
          md: 24,
        },
      }}
    >
      <Alert severity={notice.severity} variant="filled" onClose={closeNotice}>
        {notice.message}
      </Alert>
    </Snackbar>
  );
}
