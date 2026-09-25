import { devices, expect, type Page, test } from '@playwright/test';
import { login } from './login.ts';
import { touchDrag } from './touch.ts';
import { recordViewTransitions, settle } from './view.ts';

/** 引っ張って更新（`src/lib/ui/PullToRefresh.tsx`）。ブラウザのものではなくアプリのものが動く */
test.use({ ...devices['Pixel 7'] });

test.beforeEach(async ({ page }) => {
  await recordViewTransitions(page);
  await login(page);
  // ログインからホームへの遷移が終わるまで待つ。遷移の最中は撮った絵が前に出ていて、
  // 指が root に届き、アプリの枠の中から引いたことにならない
  await settle(page);
});

/**
 * ここから先で読み込み直したかを見張る。ページの中を覗いて確かめると、読み込み直している最中に
 * 覗いたときに失敗するので、ページの外（load イベント）で数える
 */
function watchReload(page: Page): () => boolean {
  let reloaded = false;
  page.once('load', () => {
    reloaded = true;
  });
  return () => reloaded;
}

/** 画面の上のほう（AppBar のすぐ下）から下へなぞる */
async function pull(page: Page, dy: number) {
  const from = { x: 200, y: 120 };
  await touchDrag(page, from, { x: from.x, y: from.y + dy }, { steps: 10 });
}

test('ページの上で下へ引き切って離すと読み込み直す', async ({ page }) => {
  const reloaded = watchReload(page);
  await pull(page, 200);
  await expect.poll(reloaded).toBe(true);
});

test('引いている途中で指の下の要素が描き直されても、離せば読み込み直す', async ({ page }) => {
  // 骨組みが中身に替わる、取り直した一覧を描き直す、など。指を下ろした要素が DOM から外れる
  const reloaded = watchReload(page);
  const from = { x: 200, y: 120 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.remove(), from);
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x, y: from.y + i * 20 }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await expect.poll(reloaded).toBe(true);
});

test('引き切らずに離すと読み込み直さない', async ({ page }) => {
  const reloaded = watchReload(page);
  await pull(page, 40);
  await page.waitForTimeout(500);
  expect(reloaded()).toBe(false);
});

test('ブラウザの引っ張って更新は止めてある', async ({ page }) => {
  const behavior = await page.evaluate(
    () => getComputedStyle(document.documentElement).overscrollBehaviorY,
  );
  expect(behavior).toBe('contain');
});

test('設定では引いても読み込み直さない', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByText('色', { exact: true })).toBeVisible();
  const reloaded = watchReload(page);
  await pull(page, 200);
  await page.waitForTimeout(500);
  expect(reloaded()).toBe(false);
});
