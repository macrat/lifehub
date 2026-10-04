import { devices, type Locator, type Page } from '@playwright/test';
import { test } from './test.ts';
import { LONG_PRESS_HOLD_MS, settledBox, touchDrag } from './touch.ts';
import { recordViewTransitions } from './view.ts';

/**
 * スマホ（指で触る画面）でのカレンダー操作の準備と、日や時刻の位置を指す道具。
 * PC との違いは `calendar-mobile-*.spec.ts` だけで確かめる。各 spec の先頭で `setupMobileCalendar()` を呼ぶ。
 */
export function setupMobileCalendar() {
  test.use({ ...devices['Pixel 7'] });
  test.beforeEach(async ({ page }) => {
    // 表示の切り替えを待つのに使う（`view.ts`）。仕込むのは最初の遷移より前
    await recordViewTransitions(page);
  });
}

/** 表示中の面（縦にスクロールする部分）。前後の面にも同じ印があるので、受け持つ日で絞る */
export function scroller(page: Page, date: string) {
  return page.locator('[data-sync-scroll]').filter({ has: page.locator(`[data-date="${date}"]`) });
}

/** その面の中身の高さ（下に足した余白を含む） */
export const scrollHeightOf = (pane: Locator) => () => pane.evaluate((el) => el.scrollHeight);

/**
 * 日のセルの中の 1 点。left は最初の日の左半分（開始をつまむ）、right は最後の日の右半分（終了）、
 * middle はそれ以外（帯ごと動かす・空いている所から選ぶ）。
 */
export async function dayPoint(
  page: Page,
  date: string,
  at: 'left' | 'middle' | 'right' = 'middle',
) {
  const box = await settledBox(page.locator(`[data-date="${date}"]`).first());
  const ratio = at === 'left' ? 0.25 : at === 'right' ? 0.75 : 0.5;
  return { x: box.x + box.width * ratio, y: box.y + box.height / 2 };
}

/**
 * 時間軸の列の中の、その日の `minutes` 分の所（終日欄にも同じ `data-date` があるので列は最後のもの）。
 * 位置は指すたびに測り直す。グリッドはシートの開閉で動くので、最初に測った縦位置は当てにならない。
 */
export async function timePoint(page: Page, date: string, minutes: number) {
  const box = await settledBox(page.locator(`[data-date="${date}"]`).last());
  return { x: box.x + box.width / 2, y: box.y + (minutes / 60) * (box.height / 24) };
}

/**
 * 日のセルを from → to へなぞる（`at` は押し始めの所）。
 * hold は押さえている時間で、空いている所から選ぶときだけ長押しが要る
 * （出ている枠に掛かる所は押した時点から動く）。
 */
export async function dragDays(
  page: Page,
  from: string,
  to: string,
  at: 'left' | 'middle' | 'right' = 'middle',
  hold = 0,
) {
  await touchDrag(page, await dayPoint(page, from, at), await dayPoint(page, to), { hold });
}

/** 空いている所から長押しでなぞって下書きを作る */
export async function selectDays(page: Page, from: string, to: string) {
  await dragDays(page, from, to, 'middle', LONG_PRESS_HOLD_MS);
}
