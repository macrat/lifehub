import { createTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { type ColorMode, DEFAULT_HUE, hueColor, SURFACE } from '../../shared/color.ts';

/** 表示モード。テーマは prefers-color-scheme に追従するので、色を自前で計算する部品もこれに合わせる */
export function useColorMode(): ColorMode {
  return useMediaQuery('(prefers-color-scheme: dark)') ? 'dark' : 'light';
}

/**
 * Material Design 3 の見た目に寄せた設定。
 * - アクセントはログイン中のユーザーの色（OKLCH の色相。shared/color.ts）1 色。secondary は使わず、
 *   強調はすべて primary で統一する。ログイン前は既定の色相（ブランドカラー）。
 * - Top App Bar と Navigation Bar はサーフェス色（M3 の仕様。M2 のようなプライマリ色の帯にしない）。
 * - CSS 変数テーマ + prefers-color-scheme 追従で、ダークモード切替時のちらつきを避ける。
 */
export function createAppTheme(hue: number = DEFAULT_HUE) {
  return createTheme({
    cssVariables: { colorSchemeSelector: 'media' },
    colorSchemes: {
      light: {
        palette: {
          primary: { main: hueColor(hue, 'accent', 'light') },
          background: { default: SURFACE.light, paper: SURFACE.light },
        },
      },
      dark: {
        palette: {
          primary: { main: hueColor(hue, 'accent', 'dark') },
          background: { default: SURFACE.dark, paper: SURFACE.dark },
        },
      },
    },
    typography: {
      fontFamily: 'system-ui, sans-serif',
    },
    shape: { borderRadius: 12 },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          // ページの端でのスクロールの連鎖を断つ。引っ張って更新（Android）が起きず、
          // シートや一覧を端まで動かしてもページごと動かない。
          html: { overscrollBehavior: 'contain' },
          body: {
            // 素早く続けて押しても拡大しない（日を次々に選ぶ、電卓を叩く）。つまむ拡大は残す
            touchAction: 'manipulation',
            // 押したときの灰色の四角を出さない。押した手応えは各部品の ripple が示す
            WebkitTapHighlightColor: 'transparent',
            // 長押しで文字が選ばれたり、リンクのメニューが出たりしない（Web ページではなくアプリとして触る）
            WebkitTouchCallout: 'none',
            userSelect: 'none',
          },
          // 文字を選んで写せるのは入力欄だけにする。読むだけの画面の文字も、
          // 鉛筆を押せば同じ場所が入力欄に変わるので、写したいときはそこから選べる。
          'input, textarea': { userSelect: 'text', WebkitTouchCallout: 'default' },
          // 控えとして描いてあるだけの部分（カレンダーのスワイプの前後の面。inert）は
          // View Transition の対象にしない。view-transition-name は文書の中で一意でなければならず、
          // 表示中の面と同じ名前が控えにもあると、遷移そのものが行われない。
          '[inert] *': { viewTransitionName: 'none !important' },
        },
      },
      MuiAppBar: {
        defaultProps: { color: 'default', elevation: 0, enableColorOnDark: false },
        styleOverrides: {
          root: ({ theme: t }) => ({
            backgroundColor: t.vars.palette.background.paper,
            color: t.vars.palette.text.primary,
            borderBottom: `1px solid ${t.vars.palette.divider}`,
          }),
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
      },
      MuiFab: {
        styleOverrides: {
          root: ({ theme: t }) => ({
            borderRadius: 16,
            boxShadow: t.shadows[3],
          }),
        },
      },
      MuiBottomNavigation: {
        styleOverrides: {
          root: ({ theme: t }) => ({
            backgroundColor: t.vars.palette.background.paper,
            borderTop: `1px solid ${t.vars.palette.divider}`,
          }),
        },
      },
      MuiBottomNavigationAction: {
        styleOverrides: {
          root: ({ theme: t }) => ({
            minWidth: 0,
            padding: '6px 4px 8px',
            color: t.vars.palette.text.secondary,
            '& .MuiSvgIcon-root': {
              padding: '2px 16px',
              borderRadius: 16,
              boxSizing: 'content-box',
              transition: 'background-color .15s',
            },
            '&.Mui-selected': {
              color: t.vars.palette.text.primary,
              '& .MuiSvgIcon-root': {
                backgroundColor: `rgba(${t.vars.palette.primary.mainChannel} / 0.16)`,
              },
            },
            '& .MuiBottomNavigationAction-label': { whiteSpace: 'nowrap', fontSize: '0.7rem' },
            '&.Mui-selected .MuiBottomNavigationAction-label': { fontSize: '0.7rem' },
          }),
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: 28 },
          // スマホの全画面フォームはページとして見せるので角丸にしない
          paperFullScreen: { borderRadius: 0 },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: { borderRadius: 20, textTransform: 'none' },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 8 },
        },
      },
    },
  });
}
