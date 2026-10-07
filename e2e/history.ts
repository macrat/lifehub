import type { Locator, Page } from '@playwright/test';
import { toDateString } from '../shared/date.ts';
import { type Api, apiOf } from './api.ts';

/**
 * お金の記録・レモンの履歴（`src/lib/ui/HistoryList.tsx`）を確かめるテストの道具。
 * 記録は API で置き、最初の位置は「今日の最新の記録が、一覧の上に貼り付いた帯のすぐ下」で見る。
 */

/** 記録の出どころ。add で ID を決めた記録を 1 件置き、router の delete で消す */
export type History = {
  router: 'money' | 'lemon';
  add: (api: Api, id: string, me: string, at: Date, text: string) => Promise<void>;
  /** 一覧の上に貼り付いた帯の中の物（最初の位置は、今日の最新の記録がこの帯のすぐ下） */
  sticky: (page: Page) => Locator;
};

/** 立替（自分が払った 100 円） */
export const expenseHistory: History = {
  router: 'money',
  add: (api, id, me, at, text) =>
    api.money.create.mutate({
      id,
      fromUserId: me,
      toUserId: null,
      amount: 100,
      description: text,
      occurredOn: toDateString(at),
    }),
  sticky: (page) => page.getByRole('region', { name: '精算' }),
};

/** レモンの世話の記録（水やり） */
export const careLogHistory: History = {
  router: 'lemon',
  add: (api, id, _me, at, text) =>
    api.lemon.create.mutate({ id, careTypes: ['water'], doneAt: at.toISOString(), note: text }),
  sticky: (page) => page.getByText('水やり', { exact: true }).first(),
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

/** locator を含む、一覧の上に貼り付いた帯（`ScrollAwayHeader`。position: sticky）の下端の、画面の上からの位置 */
async function stickyBottom(locator: Locator): Promise<number> {
  return locator.first().evaluate((el) => {
    let node: Element | null = el;
    while (node && getComputedStyle(node).position !== 'sticky') node = node.parentElement;
    return node?.getBoundingClientRect().bottom ?? 0;
  });
}

/**
 * text の行が、sticky を含む貼り付いた帯のすぐ下にあるか（最初の位置）。帯の下端から行の上端までの隙間が 0 以上で、
 * 間に別の行が入らない（立替は行の上に日の見出しがあるので、行 1 つ分の高さ 48px 未満で見る）
 */
export async function isJustBelowHeader(
  page: Page,
  text: string,
  sticky: Locator,
): Promise<boolean> {
  const row = await page.getByText(text).boundingBox();
  const gap = (row?.y ?? -100) - (await stickyBottom(sticky));
  return gap >= 0 && gap < 48;
}
