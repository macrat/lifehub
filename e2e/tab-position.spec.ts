import { devices, expect, type Page, test } from '@playwright/test';
import { toDateString } from '../shared/date.ts';
import { login, myId } from './login.ts';

/**
 * 下部ナビのタブで開いた画面は、どこから来ても最初の位置で出る（ホームは一番上、立替・レモンは
 * 今日の最後の記録が下部ナビのすぐ上）。今いる画面のタブをもう一度押すと、そこまでなめらかに戻る
 * （`src/navigation.ts` の `reselect: 'initialPosition'`）。
 * ルーターは移動の後にスクロール位置を復元するので、それに負けると一番上や押した時点の位置に戻される。
 */
test.use({ ...devices['Pixel 7'] });

const stamp = Date.now();
const expenseToday = `E2E タブ 立替 今日 ${stamp}`;
const lemonToday = `E2E タブ レモン 今日 ${stamp}`;
const created: { api: string; id: string }[] = [];

/** スクロールできるだけの記録を、立替とレモンに古い日付で 30 件ずつと、今日の分を 1 件ずつ置く */
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await login(page);
  const me = await myId(page);
  const post = async (api: string, body: object) => {
    const id = crypto.randomUUID();
    const res = await page.request.post(api, { data: { id, ...body } });
    expect(res.ok()).toBe(true);
    created.push({ api, id });
  };
  const days = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2001, 0, 1 + i, 3)));
  for (const [i, at] of days.entries()) {
    await post('/api/expenses', {
      fromUserId: me,
      toUserId: null,
      amount: 100,
      description: `E2E タブ 立替 ${i} ${stamp}`,
      spentOn: toDateString(at),
    });
    await post('/api/lemon/logs', {
      careTypes: ['water'],
      doneAt: at.toISOString(),
      note: `E2E タブ レモン ${i} ${stamp}`,
    });
  }
  await post('/api/expenses', {
    fromUserId: me,
    toUserId: null,
    amount: 100,
    description: expenseToday,
    spentOn: toDateString(new Date()),
  });
  await post('/api/lemon/logs', {
    careTypes: ['water'],
    doneAt: new Date().toISOString(),
    note: lemonToday,
  });
  await page.close();
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  await login(page);
  for (const { api, id } of created) await page.request.delete(`${api}/${id}`);
  await page.close();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

const nav = (page: Page) => page.getByRole('navigation').last();

/** 今日の最後の記録の下端から下部ナビの上端までの隙間（行 1 つ分より狭ければ最初の位置） */
async function gapAboveNav(page: Page, text: string) {
  const navBox = await nav(page).boundingBox();
  const row = await page.getByText(text).boundingBox();
  return (navBox?.y ?? 0) - ((row?.y ?? 0) + (row?.height ?? 0));
}

const tabs = [
  {
    name: 'ホーム',
    path: '/',
    ready: (page: Page) => page.getByText(lemonToday),
    // 最初の位置は一番上。そこから下へ読み進める
    atInitial: async (page: Page) => (await page.evaluate(() => window.scrollY)) === 0,
    away: 2000,
  },
  {
    name: '立替',
    path: '/expenses',
    ready: (page: Page) => page.getByText(expenseToday),
    atInitial: async (page: Page) => {
      const gap = await gapAboveNav(page, expenseToday);
      return gap >= 0 && gap < 48;
    },
    away: -2000,
  },
  {
    name: 'レモン',
    path: '/lemon',
    ready: (page: Page) => page.getByText(lemonToday),
    atInitial: async (page: Page) => {
      const gap = await gapAboveNav(page, lemonToday);
      return gap >= 0 && gap < 48;
    },
    away: -2000,
  },
];

/** 利用者の操作で最初の位置から離れ、動き終わるまで待つ */
async function moveAway(page: Page, deltaY: number) {
  const settled = page.evaluate(
    () => new Promise((resolve) => window.addEventListener('scrollend', resolve, { once: true })),
  );
  await page.mouse.wheel(0, deltaY);
  await settled;
}

for (const tab of tabs) {
  test(`${tab.name}は、別のタブから戻ってきても最初の位置で出る`, async ({ page }) => {
    const other = tabs.find((t) => t !== tab) ?? tab;
    await nav(page).getByRole('link', { name: tab.name }).click();
    await expect(tab.ready(page)).toBeAttached();
    await expect.poll(() => tab.atInitial(page)).toBe(true);

    // 動かしてから別のタブへ行き、戻ってくる（2 回目は取得済みのデータですぐ描かれる）
    await moveAway(page, tab.away);
    expect(await tab.atInitial(page)).toBe(false);
    await nav(page).getByRole('link', { name: other.name }).click();
    await expect(page).toHaveURL(other.path);
    await nav(page).getByRole('link', { name: tab.name }).click();
    await expect(tab.ready(page)).toBeAttached();
    await expect.poll(() => tab.atInitial(page)).toBe(true);
  });

  test(`${tab.name}で${tab.name}のタブを押すと、最初の位置までなめらかにスクロールする`, async ({
    page,
  }) => {
    await nav(page).getByRole('link', { name: tab.name }).click();
    await expect(tab.ready(page)).toBeAttached();
    await expect.poll(() => tab.atInitial(page)).toBe(true);
    await moveAway(page, tab.away);
    const from = await page.evaluate(() => window.scrollY);

    // 途中の位置を何度も通って（一瞬で飛ばない）、最後は最初の位置に着く
    const seen = page.evaluate(
      () =>
        new Promise<number[]>((resolve) => {
          const positions: number[] = [];
          window.addEventListener('scroll', () => positions.push(window.scrollY));
          window.addEventListener('scrollend', () => resolve(positions), { once: true });
        }),
    );
    await nav(page).getByRole('link', { name: tab.name }).click();
    const positions = await seen;
    const between = positions.filter((y) => y !== from && y !== positions.at(-1));
    expect(between.length).toBeGreaterThan(2);
    expect(await tab.atInitial(page)).toBe(true);
  });
}
