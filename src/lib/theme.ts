import { createTheme, type Theme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { type ColorMode, DEFAULT_HUE, hueColor, SURFACE } from '../../shared/color.ts';
import { meQueryOptions } from './auth.ts';
import { createStore } from './store.ts';

/** 表示モード。テーマは prefers-color-scheme に追従するので、色を自前で計算する部品もこれに合わせる */
export function useColorMode(): ColorMode {
  return useMediaQuery('(prefers-color-scheme: dark)') ? 'dark' : 'light';
}

/**
 * まだ保存していないアクセントカラー（設定画面で選んでいる最中の色相。null なら保存済みの色を使う）。
 * 選んだ色の見え方は、実際に使われる部品（スイッチ、取得中のインジケータ、ボタン）に当ててみないと
 * 分からないので、保存前の色相をここに持ってテーマ全体に反映する。設定画面が持つと、その画面の中しか
 * 変えられない。同時に 1 つだけあればよく（色を選べる画面は 1 つ）、保存するか設定画面を離れれば消える。
 */
export const [usePreviewHue, previewHue] = createStore<number | null>(null);

/**
 * アプリのテーマ。アクセントは選んでいる最中の色があればそれ、無ければログイン中のユーザーの色。
 * ユーザーの取得はルートのガードに任せ、ここはキャッシュを読むだけ。
 */
export function useAppTheme(): Theme {
  const { data: me } = useQuery({ ...meQueryOptions, enabled: false });
  const hue = usePreviewHue() ?? me?.hue;
  return useMemo(() => createAppTheme(hue), [hue]);
}

/**
 * Material Design 3 の見た目に寄せた設定。
 * - アクセントは渡された色相（OKLCH。shared/color.ts）1 色。secondary は使わず、強調はすべて primary で
 *   統一する。色相を渡さなければ既定の色相（ブランドカラー。ログイン前と、ユーザーの色が読めないとき）。
 * - Top App Bar と Navigation Bar はサーフェス色（M3 の仕様。M2 のようなプライマリ色の帯にしない）。
 * - CSS 変数テーマ + prefers-color-scheme 追従で、ダークモード切替時のちらつきを避ける。
 */
function createAppTheme(hue: number = DEFAULT_HUE) {
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
          // Web ページではなくアプリとして触れるようにする（引っ張って更新だけは残す。NoPullToRefresh）
          body: {
            // ブラウザの拡大縮小はしない。素早く続けて押しても（日を次々に選ぶ、電卓を叩く）、
            // つまんでも画面は動かず、つまむ操作はアプリ側で使う（カレンダーの週・日表示の時間軸）
            touchAction: 'pan-x pan-y',
            // 押したときの灰色の四角を出さない。押した手応えは各部品の ripple が示す
            WebkitTapHighlightColor: 'transparent',
            // 長押ししても文字が選ばれず、リンクのメニューも出ない
            WebkitTouchCallout: 'none',
            userSelect: 'none',
          },
          // 文字を選んで写せるのは入力欄だけにする（読むだけの画面の文字も、鉛筆を押せば入力欄に変わる）。
          // 触れる合図はどちらも継承するので、入力欄では選択も長押しのメニュー（貼り付け）も戻す。
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
      MuiAlert: {
        // 塗りの info（ただの知らせ。lib/ui/notice.ts）はアクセントカラーで出す。
        // WHY NOT palette.info を変える: 土曜日の青（lib/date.ts）など info.main を使う他の場所まで変わる。
        // WHY NOT color="primary": CSS 変数テーマでは塗りの色の変数が info/success/warning/error の分しか作られない。
        variants: [
          {
            props: { severity: 'info', variant: 'filled' },
            style: ({ theme: t }) => ({
              backgroundColor: t.vars.palette.primary.main,
              color: t.vars.palette.primary.contrastText,
            }),
          },
        ],
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
