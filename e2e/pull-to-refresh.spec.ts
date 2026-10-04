import { devices, type Page } from '@playwright/test';
import { openHome } from './auth.ts';
import { appBar } from './layout.ts';
import { failFetches, fetchesAfterLoad, quiet } from './network.ts';
import { expect, test } from './test.ts';
import { touchDrag } from './touch.ts';

/**
 * 引っ張って更新（`src/lib/ui/PullToRefresh.tsx`）を実ブラウザで通して確かめる。ブラウザのものではなくアプリのものが動き、
 * ページは読み込み直さずに画面のデータを取り直す。
 * どの端から引けるか・引き切ったか・オフラインの間は引けないこと、などのなぞりの判定は
 * `src/lib/__tests__/use-pull-to-refresh.test.ts` が確かめる。ここでは、画面の一覧が付ける読み足す端の印と
 * 実際のスクロールに合わせて、引ける端から取り直せることを見る。
 */
test.use({ ...devices['Pixel 7'] });

/** 指を下ろす所。画面の上のほう（AppBar のすぐ下） */
const FROM = { x: 200, y: 120 };

/** FROM から下へなぞる（上端から引く） */
async function pull(page: Page) {
  await touchDrag(page, FROM, { x: FROM.x, y: FROM.y + 200 }, { steps: 10 });
}

/** 下端から引くときに指を下ろす所。画面の下のほう（下部ナビのすぐ上） */
const FROM_BOTTOM = { x: 200, y: 700 };

/** FROM_BOTTOM から上へなぞる（下端から引く） */
async function pullUp(page: Page) {
  await touchDrag(page, FROM_BOTTOM, { x: FROM_BOTTOM.x, y: FROM_BOTTOM.y - 200 }, { steps: 10 });
}

test('ホームの上で下へ引き切って離すと、読み込み直さずにデータを取り直す', async ({ page }) => {
  await openHome(page);
  // ブラウザの引っ張って更新（ページの読み込み直し）は止めてある
  expect(
    await page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY),
  ).toBe('contain');
  const fetched = await fetchesAfterLoad(page, 'timeline.get');
  // 読み込み直したかは、ページの外（load イベント）で見る
  let reloaded = false;
  page.once('load', () => {
    reloaded = true;
  });
  await pull(page);
  await expect.poll(fetched).toBeGreaterThan(0);
  expect(reloaded).toBe(false);
});

test('オフラインと分からないまま取り直せなかったときは、短く知らせる', async ({ page }) => {
  await openHome(page);
  // Wi-Fi には繋がっているが外に出られない、など。ブラウザはオンラインのまま、取得だけが失敗する
  await failFetches(page, ['timeline.get']);
  await pull(page);
  const notice = page.getByText('更新できませんでした');
  await expect(notice).toBeVisible();
  // 3 秒ほどで消える（既定の 8 秒ではない）
  await expect(notice).toBeHidden({ timeout: 5000 });
});

test('天気（今日から下が先の日）は、下端で上へ引けば取り直す', async ({ page }) => {
  await page.goto('/weather');
  await expect(appBar(page)).toContainText('東京');
  const fetched = await fetchesAfterLoad(page, 'weather.page');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await pullUp(page);
  await expect.poll(fetched).toBeGreaterThan(0);
});

test('設定では引いても取り直さない', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByText('色', { exact: true })).toBeVisible();
  // 設定が表示に使っている自分の情報
  const fetched = await fetchesAfterLoad(page, 'me.get');
  await quiet(page, fetched);
  const before = fetched();
  await pull(page);
  await quiet(page, fetched);
  expect(fetched()).toBe(before);
});
