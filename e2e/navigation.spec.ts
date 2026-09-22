import { expect, test } from '@playwright/test';
import { login } from './login.ts';

/**
 * 画面の移動はデータの到着を待たない（ルートに loader を置かない。src/main.tsx と各ページ）。
 * 待たせてしまうと、その端末で初めて開くタブではタップしても前の画面のまま固まって見える。
 * 取得を遅らせたうえで、移った先の画面がすぐ出て、内容の場所には骨組みが出ることを確かめる。
 */
test('タブの切り替えはデータを待たず、届くまで骨組みを出す', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('heading', { name: '今日' })).toBeVisible();

  // 立替の履歴（この端末ではまだ開いていない＝キャッシュに無い）を 5 秒遅らせる
  await page.route('**/api/expenses', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await route.continue();
  });

  await page.getByRole('link', { name: '立替' }).click();
  await expect(page).toHaveURL('/expenses');
  // 立替の画面（AppBar の検索窓）が出て、ホームのカードは残っていない
  await expect(page.getByLabel('立替を検索')).toBeVisible({ timeout: 3000 });
  await expect(page.getByRole('heading', { name: '今日' })).toHaveCount(0);
  // 履歴の場所には骨組みが出ていて、届いたら消える
  await expect(page.locator('[aria-busy="true"]')).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 10_000 });
});
