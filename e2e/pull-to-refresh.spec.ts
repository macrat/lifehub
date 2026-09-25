import { devices, expect, type Page, test } from '@playwright/test';
import { login } from './login.ts';
import { countFetches, quiet } from './network.ts';
import { touchDrag } from './touch.ts';
import { recordViewTransitions, settle } from './view.ts';

/**
 * 引っ張って更新（`src/lib/ui/PullToRefresh.tsx`）。ブラウザのものではなくアプリのものが動き、
 * ページは読み込み直さずに画面のデータ（ホームならタイムライン）を取り直す
 */
test.use({ ...devices['Pixel 7'] });

/** ホームが取るタイムライン。取り直したかをこの取得の回数で見る */
const TIMELINE = '/api/timeline';

test.beforeEach(async ({ page }) => {
  await recordViewTransitions(page);
  await login(page);
  // ログインからホームへの遷移が終わるまで待つ。遷移の最中は撮った絵が前に出ていて、
  // 指が root に届き、アプリの枠の中から引いたことにならない
  await settle(page);
});

/** ここから先でページを読み込み直したか。ページの外（load イベント）で数える */
function watchReload(page: Page): () => boolean {
  let reloaded = false;
  page.once('load', () => {
    reloaded = true;
  });
  return () => reloaded;
}

/** 指を下ろす所。画面の上のほう（AppBar のすぐ下） */
const FROM = { x: 200, y: 120 };

/** FROM から下へなぞる */
async function pull(page: Page, dy: number, options: { afterStart?: () => Promise<unknown> } = {}) {
  await touchDrag(page, FROM, { x: FROM.x, y: FROM.y + dy }, { steps: 10, ...options });
}

/** 取得が落ち着いてから数え始める（開いた直後の取得を、引いたことによる取得と取り違えない） */
async function settledFetches(page: Page, pathname: string) {
  const fetches = countFetches(page, pathname);
  await quiet(page, fetches);
  const before = fetches();
  return () => fetches() - before;
}

test('ページの上で下へ引き切って離すと、読み込み直さずにデータを取り直す', async ({ page }) => {
  const fetched = await settledFetches(page, TIMELINE);
  const reloaded = watchReload(page);
  await pull(page, 200);
  await expect.poll(fetched).toBeGreaterThan(0);
  expect(reloaded()).toBe(false);
});

test('引いている途中で指の下の要素が描き直されても、離せば取り直す', async ({ page }) => {
  // 骨組みが中身に替わる、取り直した一覧を描き直す、など。指を下ろした要素が DOM から外れる
  const fetched = await settledFetches(page, TIMELINE);
  await pull(page, 200, {
    afterStart: () => page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.remove(), FROM),
  });
  await expect.poll(fetched).toBeGreaterThan(0);
});

test('引き切らずに離すと取り直さない', async ({ page }) => {
  const fetched = await settledFetches(page, TIMELINE);
  await pull(page, 40);
  await page.waitForTimeout(500);
  expect(fetched()).toBe(0);
});

test('オフラインでは取り直さず、更新できなかったことを短く知らせる', async ({ page, context }) => {
  await context.setOffline(true);
  // オフラインの案内が出て画面がずれ、一覧が続きを読みに行く分は、引いたことによる取得ではない
  await expect(page.getByText('オフラインです', { exact: false })).toBeVisible();
  const fetched = await settledFetches(page, TIMELINE);
  await pull(page, 200);
  const notice = page.getByText('更新できませんでした');
  await expect(notice).toBeVisible();
  // 3 秒ほどで消える（既定の 8 秒ではない）
  await expect(notice).toBeHidden({ timeout: 5000 });
  expect(fetched()).toBe(0);
});

test('ブラウザの引っ張って更新は止めてある', async ({ page }) => {
  const behavior = await page.evaluate(
    () => getComputedStyle(document.documentElement).overscrollBehaviorY,
  );
  expect(behavior).toBe('contain');
});

test('設定では引いても取り直さない', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByText('色', { exact: true })).toBeVisible();
  // 設定が表示に使っている自分の情報
  const fetched = await settledFetches(page, '/api/me');
  await pull(page, 200);
  await page.waitForTimeout(500);
  expect(fetched()).toBe(0);
});
