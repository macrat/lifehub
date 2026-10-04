import { expect, test } from './test.ts';

// 画面のコードの取得を横取りして失敗させるので、Service Worker の precache を通さない
test.use({ serviceWorkers: 'block' });

test('デプロイで消えた旧版のコードを読めなかったら、読み込み直して開き直す', async ({ page }) => {
  // 無いファイルには index.html を返さず 404 にする（SPA のフォールバックは画面のパスだけ）
  expect((await page.request.get('/assets/missing.js')).status()).toBe(404);

  // ホームのコードをまだ読み込んでいない画面から始める
  await page.goto('/settings');
  await expect(page.getByRole('link', { name: 'ホーム' }).first()).toBeVisible();

  // 次に取りに行く画面のコード（ホーム）を 1 度だけ「デプロイで消えた」ことにする
  let failed = false;
  await page.route(/\/assets\/_authenticated-[^/]+\.js$/, (route) => {
    if (failed) return route.continue();
    failed = true;
    return route.fulfill({ status: 404 });
  });
  const reloaded = page.waitForEvent('load');
  await page.getByRole('link', { name: 'ホーム' }).first().click();

  await reloaded;
  await expect(page.getByLabel('記録を検索')).toBeVisible();
  await expect(page.getByText('エラーが発生しました')).toHaveCount(0);
});
