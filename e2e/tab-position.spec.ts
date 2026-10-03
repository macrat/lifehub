import { devices, expect, type Locator, type Page, test } from '@playwright/test';
import { myId, openHome } from './auth.ts';
import {
  addRecord,
  type Created,
  careLogHistory,
  deleteRecord,
  expenseHistory,
  isJustBelowHeader,
} from './history.ts';
import { appBar, bottomNav, bottomOf } from './layout.ts';

/**
 * 下部ナビのタブの画面は、別のタブからでも戻るでも、来たときは最初の位置で出る（ホームは一番上、立替・レモンは
 * 今日の最新の記録が貼り付いた帯のすぐ下）。来たときの位置はルートの `staticData.ownsScroll` による
 * （ルーターは移動の後にスクロール位置を戻すので、それが止まっていないと一番上や前にいた位置へ戻される）。
 * 今いる画面のタブをもう一度押すと、そこまでなめらかに戻る（`scrollToInitialPosition`）。
 */
test.use({ ...devices['Pixel 7'] });

const stamp = Date.now();
const expenseToday = `E2E タブ 立替 今日 ${stamp}`;
const lemonToday = `E2E タブ レモン 今日 ${stamp}`;
let created: Created[] = [];

/** スクロールできるだけの記録を、立替とレモンに古い日付で 30 件ずつと、今日の分を 1 件ずつ置く */
test.beforeAll(async ({ browser }) => {
  // テストの外で作るページにもログイン状態が載る（`playwright.config.ts` の storageState）
  const page = await browser.newPage();
  const me = await myId(page);
  const days = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2001, 0, 1 + i, 3)));
  const add = (history: typeof expenseHistory, at: Date, text: string) =>
    addRecord(page, history, me, at, text);
  created = await Promise.all([
    ...days.map((at, i) => add(expenseHistory, at, `E2E タブ 立替 ${i} ${stamp}`)),
    ...days.map((at, i) => add(careLogHistory, at, `E2E タブ レモン ${i} ${stamp}`)),
    add(expenseHistory, new Date(), expenseToday),
    add(careLogHistory, new Date(), lemonToday),
  ]);
  await page.close();
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  await Promise.all(created.map((record) => deleteRecord(page, record)));
  await page.close();
});

test.beforeEach(async ({ page }) => {
  await openHome(page);
});

type Tab = {
  name: string;
  path: string;
  today: string;
  /**
   * 最初の位置。top は一番上（ホーム）。locator を返す関数なら、今日の最新の記録がそれを含む貼り付いた帯の
   * すぐ下（未来の日付の記録はその上に隠れる）
   */
  initial: 'top' | ((page: Page) => Locator);
  /** 下へスクロールすると隠れる帯（の中の物） */
  scrollAwayHeader?: (page: Page) => Locator;
};

const tabs: Tab[] = [
  {
    name: 'ホーム',
    path: '/',
    today: lemonToday,
    initial: 'top',
    scrollAwayHeader: (page) => page.getByText('葉水'),
  },
  {
    name: '立替',
    path: '/expenses',
    today: expenseToday,
    initial: (page) => page.getByRole('region', { name: '精算' }),
    scrollAwayHeader: (page) => page.getByRole('region', { name: '精算' }),
  },
  {
    name: 'レモン',
    path: '/lemon',
    today: lemonToday,
    initial: (page) => page.getByText('水やり', { exact: true }).first(),
  },
];

async function atInitial(page: Page, tab: Tab) {
  return tab.initial === 'top'
    ? (await page.evaluate(() => window.scrollY)) === 0
    : isJustBelowHeader(page, tab.today, tab.initial(page));
}

/** 画面のスクロールが動き終わるまでに通った位置（呼んでから動かし始める） */
function scrollPositions(page: Page): Promise<number[]> {
  return page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const positions: number[] = [];
        window.addEventListener('scroll', () => positions.push(window.scrollY));
        window.addEventListener('scrollend', () => resolve(positions), { once: true });
      }),
  );
}

/** タブを押して開き、最初の位置に落ち着くまで待つ */
async function openTab(page: Page, tab: Tab) {
  await bottomNav(page).getByRole('link', { name: tab.name }).click();
  await expect(page).toHaveURL(tab.path);
  await expect(page.getByText(tab.today)).toBeAttached();
  await expect.poll(() => atInitial(page, tab)).toBe(true);
}

/** 利用者の操作で最初の位置から離れ（どの画面も古いほうへ、下へ）、動き終わるまで待つ */
async function moveAway(page: Page, tab: Tab) {
  const settled = scrollPositions(page);
  await page.mouse.wheel(0, 2000);
  await settled;
  expect(await atInitial(page, tab)).toBe(false);
}

for (const [index, tab] of tabs.entries()) {
  const other = tabs[(index + 1) % tabs.length] as Tab;

  test(`${tab.name}は、別のタブから戻ってきても最初の位置で出る`, async ({ page }) => {
    await openTab(page, tab);
    // 動かしてから別のタブを開き、戻ってくる（2 回目は取得済みのデータですぐ描かれる）。
    // 別のタブは出し終えるまで待つ: 画面のコードを初めて読む間は前の画面が隠れて残っているだけなので、
    // その間に戻ると離れたことにならない
    await moveAway(page, tab);
    await openTab(page, other);
    await openTab(page, tab);
  });

  test(`${tab.name}は、戻るで戻ってきても最初の位置で出る`, async ({ page }) => {
    await openTab(page, tab);
    await moveAway(page, tab);
    await openTab(page, other);
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
    const seen = scrollPositions(page);
    await bottomNav(page).getByRole('link', { name: tab.name }).click();
    const positions = await seen;
    const between = positions.filter((y) => y !== from && y !== positions.at(-1));
    expect(between.length).toBeGreaterThan(2);
    expect(await atInitial(page, tab)).toBe(true);
    // 下へスクロールすると隠れる帯（ホームのタイル、立替の精算）も、最初に開いたときと同じく出ている
    if (tab.scrollAwayHeader) {
      const header = tab.scrollAwayHeader(page);
      const barBottom = await bottomOf(appBar(page));
      await expect.poll(() => bottomOf(header)).toBeGreaterThan(barBottom);
    }
  });
}
