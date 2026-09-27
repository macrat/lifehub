import { SQUIRCLE_SHADOW } from './squircle.ts';

/**
 * アプリの枠（`AppShell`）の寸法と、それに合わせて置く物の位置。
 * 枠の中のページも「画面いっぱい」や貼り付く位置を計算するのに読むので、部品の file とは分けて置く。
 */

/** 下部ナビの高さ。ページ側で「画面いっぱい」を計算するときに使う */
export const BOTTOM_NAV_HEIGHT = 56;
/** AppBar（dense）の高さ */
export const APP_BAR_HEIGHT = 48;
/** AppBar の下端。一覧の上に貼り付ける物（絞り込みのフォーム、状況のタイル）はここに貼り付く */
export const STICKY_TOP = `calc(${APP_BAR_HEIGHT}px + env(safe-area-inset-top))`;
/** 下部ナビの上端。スマホで画面の下端に寄せる物（引っ張って更新の印、スクロールの下端）はここを下端にする */
export const BOTTOM_NAV_TOP = `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))`;
/**
 * ページ（main）の下端の余白。右下の追加ボタンに最後の内容が隠れないよう取る。スマホは下部ナビの分も足す。
 * md から PC（サイドナビ。`useIsDesktop` と同じ境界）
 */
export const MAIN_BOTTOM_PADDING = { xs: `calc(${BOTTOM_NAV_TOP} + 96px)`, md: '96px' } as const;

/** 右下の追加ボタン（FAB / SpeedDial）の置き場所（位置と影）。スマホでは下部ナビの上に置く */
export const FAB_SX = {
  position: 'fixed',
  // ボタンはスクワークルに切り抜かれて自分の影を持てないので、影は置き場所（外側）に掛ける
  filter: SQUIRCLE_SHADOW,
  right: 16,
  bottom: { xs: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom) + 16px)`, md: 24 },
} as const;
