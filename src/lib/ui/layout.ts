/**
 * アプリの枠（`AppShell`）の寸法と、それに合わせて置く物の位置。
 * 枠の中のページも「画面いっぱい」や貼り付く位置を計算するのに読むので、部品の file とは分けて置く。
 */

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
