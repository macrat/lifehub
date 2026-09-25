import type { Page } from '@playwright/test';
import { toDateString } from '../shared/date.ts';

/**
 * 立替・レモンの履歴（`src/lib/ui/HistoryList.tsx`）を確かめるテストの道具。
 * 記録は API で置き、最初の位置は「今日の最後の記録が下部ナビのすぐ上」で見る。
 */

/** 立替 1 件の本文（自分が払った 100 円） */
export const expenseBody = (me: string, at: Date, text: string) => ({
  fromUserId: me,
  toUserId: null,
  amount: 100,
  description: text,
  spentOn: toDateString(at),
});

/** レモンの世話の記録 1 件の本文（水やり） */
export const careLogBody = (_me: string, at: Date, text: string) => ({
  careTypes: ['water'],
  doneAt: at.toISOString(),
  note: text,
});

/** スマホの下部ナビ（画面の最後の navigation） */
export const bottomNav = (page: Page) => page.getByRole('navigation').last();

/**
 * text の行の下端から下部ナビの上端までの隙間（px）。最初の位置なら 0 以上で、行 1 つ分（48px）より狭い
 * （測るのは行の中の文字で、立替はその下に名前と日の区切りの余白があるので、行 1 つ分の高さ未満で見る）
 */
export async function gapAboveBottomNav(page: Page, text: string): Promise<number> {
  const nav = await bottomNav(page).boundingBox();
  const row = await page.getByText(text).boundingBox();
  return (nav?.y ?? 0) - ((row?.y ?? 0) + (row?.height ?? 0));
}
