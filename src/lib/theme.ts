import { createTheme, type Theme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useSyncExternalStore } from 'react';
import { type ColorMode, DEFAULT_HUE, hueColor } from '../../shared/color.ts';
import { meQueryOptions } from './auth.ts';

/** 表示モード。テーマは prefers-color-scheme に追従するので、色を自前で計算する部品もこれに合わせる */
export function useColorMode(): ColorMode {
  return useMediaQuery('(prefers-color-scheme: dark)') ? 'dark' : 'light';
}

/**
 * まだ保存していないアクセントカラー（設定画面で選んでいる最中の色相）。
 * 選んだ色の見え方は、実際に使われる部品（スイッチ、取得中のインジケータ、ボタン）に当ててみないと
 * 分からないので、保存前の色相をここに持ってテーマ全体に反映する。設定画面が持つと、その画面の中しか
 * 変えられない。同時に 1 つだけあればよく（色を選べる画面は 1 つ）、保存するか設定画面を離れれば消える。
 */
let pendingHue: number | null = null;
const listeners = new Set<() => void>();

/** 保存前の色相を選び直す。null で捨てて、保存済みの色（ログイン中のユーザーの色）に戻す */
export function previewHue(hue: number | null): void {
  pendingHue = hue;
  for (const listener of listeners) listener();
}

export function usePreviewHue(): number | null {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    () => pendingHue,
    () => null,
  );
}

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
          background: { default: '#ffffff', paper: '#ffffff' },
        },
      },
      dark: {
        palette: {
          primary: { main: hueColor(hue, 'accent', 'dark') },
          background: { default: '#121212', paper: '#121212' },
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
