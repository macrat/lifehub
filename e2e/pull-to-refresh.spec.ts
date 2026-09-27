import { devices, expect, type Page, test } from '@playwright/test';
import { openHome } from './auth.ts';
import { fetchesFromNow, quiet } from './network.ts';
import { touchDrag } from './touch.ts';

/**
 * 引っ張って更新（`src/lib/ui/PullToRefresh.tsx`）。ブラウザのものではなくアプリのものが動き、
 * ページは読み込み直さずに画面のデータ（ホームならタイムライン）を取り直す。
 * 引ける端は無限スクロールで読み足す端の逆だけ（一覧の端の見張り `EdgeSentinel` の印で決まる）。上が古く下が新しい一覧（立替など）は
 * 下端から上へ、上が新しい一覧（ホーム）は上端から下へ引き、上下に読み足す一覧（予定のリスト）は引けない
 */
test.use({ ...devices['Pixel 7'] });

/** ホームが取るタイムライン。取り直したかをこの取得の回数で見る */
const TIMELINE = '/api/timeline';

/** 指を下ろす所。画面の上のほう（AppBar のすぐ下） */
const FROM = { x: 200, y: 120 };

/** FROM から下へなぞる */
async function pull(page: Page, dy: number, options: { afterStart?: () => Promise<unknown> } = {}) {
  await touchDrag(page, FROM, { x: FROM.x, y: FROM.y + dy }, { steps: 10, ...options });
}

/** 下端から引くときに指を下ろす所。画面の下のほう（下部ナビのすぐ上） */
const FROM_BOTTOM = { x: 200, y: 700 };

/** FROM_BOTTOM から上へなぞる */
async function pullUp(page: Page, dy: number) {
  await touchDrag(page, FROM_BOTTOM, { x: FROM_BOTTOM.x, y: FROM_BOTTOM.y - dy }, { steps: 10 });
}

/** ホーム（上が新しく、下へ読み足すタイムライン）で確かめる */
test.describe('ホーム', () => {
  test.beforeEach(async ({ page }) => {
    await openHome(page);
  });

  test('ページの上で下へ引き切って離すと、読み込み直さずにデータを取り直す', async ({ page }) => {
    const fetched = await fetchesFromNow(page, TIMELINE);
    // 読み込み直したかは、ページの外（load イベント）で見る
    let reloaded = false;
    page.once('load', () => {
      reloaded = true;
    });
    await pull(page, 200);
    await expect.poll(fetched).toBeGreaterThan(0);
    expect(reloaded).toBe(false);
  });

  test('引いている途中で指の下の要素が描き直されても、離せば取り直す', async ({ page }) => {
    // 骨組みが中身に替わる、取り直した一覧を描き直す、など。指を下ろした要素が DOM から外れる
    const fetched = await fetchesFromNow(page, TIMELINE);
    await pull(page, 200, {
      afterStart: () =>
        page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.remove(), FROM),
    });
    await expect.poll(fetched).toBeGreaterThan(0);
  });

  test('引き切らずに離すと取り直さない', async ({ page }) => {
    const fetched = await fetchesFromNow(page, TIMELINE);
    await pull(page, 40);
    await quiet(page, fetched);
    expect(fetched()).toBe(0);
  });

  test('オフラインと分かっている間は引けない', async ({ page, context }) => {
    await context.setOffline(true);
    // オフラインの案内が出て画面がずれ、一覧が続きを読みに行く分は、引いたことによる取得ではない
    await expect(page.getByText('オフラインモード', { exact: false })).toBeVisible();
    const fetched = await fetchesFromNow(page, TIMELINE);
    await pull(page, 200);
    await quiet(page, fetched);
    expect(fetched()).toBe(0);
    await expect(page.getByText('更新できませんでした')).toHaveCount(0);
  });

  test('オフラインと分からないまま取り直せなかったときは、短く知らせる', async ({ page }) => {
    // Wi-Fi には繋がっているが外に出られない、など。ブラウザはオンラインのまま、取得だけが失敗する
    await page.route(`**${TIMELINE}*`, (route) => route.abort('internetdisconnected'));
    await pull(page, 200);
    const notice = page.getByText('更新できませんでした');
    await expect(notice).toBeVisible();
    // 3 秒ほどで消える（既定の 8 秒ではない）
    await expect(notice).toBeHidden({ timeout: 5000 });
  });

  test('上が新しい一覧（ホーム）では、上へ引いても取り直さない', async ({ page }) => {
    // タイムラインが短くページがスクロールしなくても、上端から引いたことにはならない
    const fetched = await fetchesFromNow(page, TIMELINE);
    await pullUp(page, 200);
    await quiet(page, fetched);
    expect(fetched()).toBe(0);
  });

  test('ブラウザの引っ張って更新は止めてある', async ({ page }) => {
    const behavior = await page.evaluate(
      () => getComputedStyle(document.documentElement).overscrollBehaviorY,
    );
    expect(behavior).toBe('contain');
  });
});

test('下が新しい一覧では、上端（古いほうを読み足す端）から引いても取り直さず、下端で上へ引くと取り直す', async ({
  page,
}) => {
  await page.goto('/expenses');
  await expect(page.getByLabel('立替を検索')).toBeVisible();
  const fetched = await fetchesFromNow(page, '/api/expenses');
  await page.evaluate(() => window.scrollTo(0, 0));
  await pull(page, 200);
  await quiet(page, fetched);
  expect(fetched()).toBe(0);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await pullUp(page, 200);
  await expect.poll(fetched).toBeGreaterThan(0);
});

test('天気（今日から下が先の日）も、下端で上へ引けば取り直し、上端から引いても取り直さない', async ({
  page,
}) => {
  await page.goto('/weather');
  await expect(page.getByRole('banner')).toContainText('東京');
  const fetched = await fetchesFromNow(page, '/api/weather');
  await page.evaluate(() => window.scrollTo(0, 0));
  await pull(page, 200);
  await quiet(page, fetched);
  expect(fetched()).toBe(0);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await pullUp(page, 200);
  await expect.poll(fetched).toBeGreaterThan(0);
});

test('予定のリストでは上端からも下端からも引いても取り直さない', async ({ page }) => {
  // 期間を 1 か月に絞り、前後の月を読み足さずに上端と下端のどちらにもいる短い一覧にする
  await page.goto('/calendar?view=list&date=2032-06-15&from=2032-06-01&to=2032-06-30');
  await expect(page.getByRole('heading', { name: '6/15' })).toBeVisible();
  const fetched = await fetchesFromNow(page, '/api/calendar');
  await pull(page, 200);
  await pullUp(page, 200);
  await quiet(page, fetched);
  expect(fetched()).toBe(0);
});

test('設定では引いても取り直さない', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByText('色', { exact: true })).toBeVisible();
  // 設定が表示に使っている自分の情報
  const fetched = await fetchesFromNow(page, '/api/me');
  await pull(page, 200);
  await quiet(page, fetched);
  expect(fetched()).toBe(0);
});
