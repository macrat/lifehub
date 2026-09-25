import { devices, expect, type Page, test } from '@playwright/test';
import { bottomNav, careLogBody, expenseBody, gapAboveBottomNav } from './history.ts';
import { login, myId } from './login.ts';

/**
 * 下部ナビのタブの画面は、別のタブからでも戻るでも、来たときは最初の位置で出る（ホームは一番上、立替・レモンは
 * 今日の最後の記録が下部ナビのすぐ上）。今いる画面のタブをもう一度押すと、そこまでなめらかに戻る
 * （`src/navigation.ts` の `reselect: 'initialPosition'`）。
 * ルーターは移動の後にスクロール位置を戻すので、それが止まっていないと（ルートの `staticData.ownsScroll`）
 * 一番上や前にいた位置へ戻される。
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
  const days = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2001, 0, 1 + i, 3)));
  const expense = (at: Date, text: string) => ({
    api: '/api/expenses',
    body: expenseBody(me, at, text),
  });
  const careLog = (at: Date, text: string) => ({
    api: '/api/lemon/logs',
    body: careLogBody(me, at, text),
  });
  const records = [
    ...days.map((at, i) => expense(at, `E2E タブ 立替 ${i} ${stamp}`)),
    ...days.map((at, i) => careLog(at, `E2E タブ レモン ${i} ${stamp}`)),
    expense(new Date(), expenseToday),
    careLog(new Date(), lemonToday),
  ];
  await Promise.all(
    records.map(async ({ api, body }) => {
      const id = crypto.randomUUID();
      const res = await page.request.post(api, { data: { id, ...body } });
      expect(res.ok()).toBe(true);
      created.push({ api, id });
    }),
  );
  await page.close();
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  await login(page);
  await Promise.all(created.map(({ api, id }) => page.request.delete(`${api}/${id}`)));
  await page.close();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

/** 最初の位置が一番上の画面（top）か、今日の最後の記録が下部ナビのすぐ上の画面（bottom）か */
type Tab = { name: string; path: string; today: string; initial: 'top' | 'bottom' };

const tabs: Tab[] = [
  { name: 'ホーム', path: '/', today: lemonToday, initial: 'top' },
  { name: '立替', path: '/expenses', today: expenseToday, initial: 'bottom' },
  { name: 'レモン', path: '/lemon', today: lemonToday, initial: 'bottom' },
];

async function atInitial(page: Page, tab: Tab) {
  if (tab.initial === 'top') return (await page.evaluate(() => window.scrollY)) === 0;
  const gap = await gapAboveBottomNav(page, tab.today);
  return gap >= 0 && gap < 48;
}

/** タブを押して開き、最初の位置に落ち着くまで待つ */
async function openTab(page: Page, tab: Tab) {
  await bottomNav(page).getByRole('link', { name: tab.name }).click();
  await expect(page).toHaveURL(tab.path);
  await expect(page.getByText(tab.today)).toBeAttached();
  await expect.poll(() => atInitial(page, tab)).toBe(true);
}

/** 利用者の操作で最初の位置から離れ（一番上なら下へ、一番下なら上へ）、動き終わるまで待つ */
async function moveAway(page: Page, tab: Tab) {
  const settled = page.evaluate(
    () => new Promise((resolve) => window.addEventListener('scrollend', resolve, { once: true })),
  );
  await page.mouse.wheel(0, tab.initial === 'top' ? 2000 : -2000);
  await settled;
  expect(await atInitial(page, tab)).toBe(false);
}

for (const [index, tab] of tabs.entries()) {
  test(`${tab.name}は、別のタブから戻ってきても最初の位置で出る`, async ({ page }) => {
    await openTab(page, tab);
    // 動かしてから別のタブを開き、戻ってくる（2 回目は取得済みのデータですぐ描かれる）。
    // 別のタブは出し終えるまで待つ: 画面のコードを初めて読む間は前の画面が隠れて残っているだけなので、
    // その間に戻ると離れたことにならない
    await moveAway(page, tab);
    await openTab(page, tabs[(index + 1) % tabs.length] as Tab);
    await openTab(page, tab);
  });

  test(`${tab.name}は、戻るで戻ってきても最初の位置で出る`, async ({ page }) => {
    await openTab(page, tab);
    await moveAway(page, tab);
    await openTab(page, tabs[(index + 1) % tabs.length] as Tab);
    await page.goBack();
    await expect(page).toHaveURL(tab.path);
    await expect.poll(() => atInitial(page, tab)).toBe(true);
  });

  test(`${tab.name}で${tab.name}のタブを押すと、最初の位置までなめらかにスクロールする`, async ({
    page,
  }) => {
    await openTab(page, tab);
    await moveAway(page, tab);
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
    await bottomNav(page).getByRole('link', { name: tab.name }).click();
    const positions = await seen;
    const between = positions.filter((y) => y !== from && y !== positions.at(-1));
    expect(between.length).toBeGreaterThan(2);
    expect(await atInitial(page, tab)).toBe(true);
  });
}
