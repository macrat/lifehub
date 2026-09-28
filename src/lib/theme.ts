import { createTheme, type Theme, type ThemeOptions } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { type ColorMode, DEFAULT_HUE, hueColor, SURFACE } from '../../shared/color.ts';
import { meQueryOptions } from './auth.ts';
import { createStore } from './store.ts';
import { SQUIRCLE_CLIP_PATH } from './ui/squircle.ts';

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
 * 日付・時刻の欄の右の印（ブラウザが描く、押すとピッカーが開くもの）を、ドロップダウン（TextField の
 * select）の ▼ と同じ見た目にする。形・大きさ・色・位置・開いている間の向きは MUI の Select のアイコン
 * （内部の ArrowDropDown。SvgIcon の medium = 1.5rem、action.active、outlined の枠の右端から 7px、
 * 開いている間は 180° 回す）の値をそのまま写す。MUI はそれらを import できる形で出していない。
 * WHY NOT 印を消して ArrowDropDown を横に置く: 印そのものがピッカーを開くボタンなので、
 * 消すと押す場所が無くなる。印を残して描き方だけ変える。
 * WHY mask: 色をテーマの CSS 変数で塗れる（background-image の SVG では色を変えられない）。
 * WHY MuiOutlinedInput: 位置合わせの -7px が outlined の右の余白（14px）を前提にしている。
 */
const PICKER_INDICATOR_AS_SELECT_ICON = {
  '&::-webkit-calendar-picker-indicator': {
    width: '1.5rem',
    height: '1.5rem',
    padding: 0,
    marginInlineEnd: -7,
    // 欄の高さを変えない（印は文字の行より少し高い）
    marginBlock: '-0.5rem',
    cursor: 'pointer',
    backgroundImage: 'none',
    backgroundColor: 'var(--mui-palette-action-active)',
    mask: `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>') center / contain no-repeat`,
  },
  '&:open::-webkit-calendar-picker-indicator': { transform: 'rotate(180deg)' },
};

/** 部品の設定のうち、色相に依らないもの（テーマを作るたびに組み立て直さない） */
const FIXED_COMPONENTS = {
  MuiStack: {
    // 間隔は CSS の gap で空ける。MUI の既定（兄弟要素への margin）では、hidden input のような
    // 見えない子も兄弟に数えられて先頭の欄に余計な margin が付き、折り返した行の先頭にも margin が残る
    defaultProps: { useFlexGap: true },
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
} satisfies ThemeOptions['components'];

/**
 * Material Design 3 の見た目に寄せた設定。
 * - アクセントは渡された色相（OKLCH。shared/color.ts）1 色。secondary は使わず、強調はすべて primary で
 *   統一する。色相を渡さなければ既定の色相（ブランドカラー。ログイン前と、ユーザーの色が読めないとき）。
 * - Top App Bar と Navigation Bar はサーフェス色（M3 の仕様。M2 のようなプライマリ色の帯にしない）。
 * - CSS 変数テーマ + prefers-color-scheme 追従で、ダークモード切替時のちらつきを避ける。
 */
function createAppTheme(hue: number = DEFAULT_HUE) {
  return createTheme({
    // nativeColor: パレットに oklch() をそのまま渡し、明暗の派生色や文字色は CSS（color-mix・相対色）で作らせる。
    // これが無いと MUI はパレットの色を JS で解析するので、hex / rgb しか受けない
    cssVariables: { colorSchemeSelector: 'media', nativeColor: true },
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
          // Web ページではなくアプリとして触れるようにする（引っ張って更新はアプリのもの。PullToRefresh）
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
      MuiOutlinedInput: { styleOverrides: { input: PICKER_INDICATOR_AS_SELECT_ICON } },
      MuiPaper: {
        defaultProps: { elevation: 0 },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
      },
      MuiFab: {
        styleOverrides: {
          // 丸い（ラベルを持たない）追加ボタンはスクワークルに切り抜く。切り抜くと影も消えるので、
          // 影は外側の箱が持つ（`SQUIRCLE_SHADOW`）。ラベル付きの pill（追加ボタンを開いた中の項目）は角丸のまま
          root: ({ theme: t, ownerState }) =>
            ownerState.variant === 'extended'
              ? { borderRadius: 16, boxShadow: t.shadows[3] }
              : { borderRadius: 0, boxShadow: 'none', clipPath: SQUIRCLE_CLIP_PATH },
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
      ...FIXED_COMPONENTS,
    },
  });
}
