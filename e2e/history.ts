import type { Page } from '@playwright/test';
import { toDateString } from '../shared/date.ts';
import { type Api, apiOf } from './api.ts';
import { bottomNav } from './layout.ts';

/**
 * 立替・レモンの履歴（`src/lib/ui/HistoryList.tsx`）を確かめるテストの道具。
 * 記録は API で置き、最初の位置は「今日の最後の記録が下部ナビのすぐ上」で見る。
 */

/** 記録の出どころ。add で ID を決めた記録を 1 件置き、router の delete で消す */
type History = {
  router: 'expenses' | 'lemon';
  add: (api: Api, id: string, me: string, at: Date, text: string) => Promise<void>;
};

/** 立替（自分が払った 100 円） */
export const expenseHistory: History = {
  router: 'expenses',
  add: (api, id, me, at, text) =>
    api.expenses.create.mutate({
      id,
      fromUserId: me,
      toUserId: null,
      amount: 100,
      description: text,
      spentOn: toDateString(at),
    }),
};

/** レモンの世話の記録（水やり） */
export const careLogHistory: History = {
  router: 'lemon',
  add: (api, id, _me, at, text) =>
    api.lemon.create.mutate({ id, careTypes: ['water'], doneAt: at.toISOString(), note: text }),
};

/** 置いた記録。後で `deleteRecord` で消す */
export type Created = { router: History['router']; id: string };

/** history の決まった形の記録を 1 件置く。ID は送る側が決める（書き込みは値を返さない） */
export async function addRecord(
  page: Page,
  history: History,
  me: string,
  at: Date,
  text: string,
): Promise<Created> {
  const id = crypto.randomUUID();
  await history.add(apiOf(page.request), id, me, at, text);
  return { router: history.router, id };
}

export async function deleteRecord(page: Page, { router, id }: Created) {
  await apiOf(page.request)[router].delete.mutate({ id });
}

/**
 * text の行が下部ナビのすぐ上にあるか（最初の位置）。行の下端から下部ナビの上端までの隙間が 0 以上で、
 * 間に別の行が入らない（測るのは行の中の文字で、立替はその下に名前と日の区切りの余白があるので、
 * 行 1 つ分の高さ 48px 未満で見る）
 */
export async function isJustAboveBottomNav(page: Page, text: string): Promise<boolean> {
  const nav = await bottomNav(page).boundingBox();
  const row = await page.getByText(text).boundingBox();
  const gap = (nav?.y ?? 0) - ((row?.y ?? 0) + (row?.height ?? 0));
  return gap >= 0 && gap < 48;
}
