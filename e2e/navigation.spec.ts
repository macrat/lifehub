import { expect, type Locator, test } from '@playwright/test';
import { login } from './login.ts';
import { countFetches, quiet, stall } from './network.ts';

/**
 * 画面の移動はデータの到着を待たない（ルートに loader を置かない。src/main.tsx と各ページ）。
 * 待たせてしまうと、その端末で初めて開くタブではタップしても前の画面のまま固まって見える。
 * 取得を遅らせたうえで、移った先の画面がすぐ出て、内容の場所には骨組みが出ることを確かめる。
 */
test('タブの切り替えはデータを待たず、届くまで骨組みを出す', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('heading', { name: '今日' })).toBeVisible();

  // 立替の履歴（この端末ではまだ開いていない＝キャッシュに無い）を 5 秒遅らせる
  await stall(page, '**/api/expenses', 5000);

  await page.getByRole('link', { name: '立替' }).click();
  await expect(page).toHaveURL('/expenses');
  // 立替の画面（AppBar の検索窓）が出て、ホームのカードは残っていない
  await expect(page.getByLabel('立替を検索')).toBeVisible({ timeout: 3000 });
  await expect(page.getByRole('heading', { name: '今日' })).toHaveCount(0);
  // 履歴の場所には骨組みが出ていて、届いたら消える
  await expect(page.locator('[aria-busy="true"]')).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 10_000 });
});

/**
 * 上部の細いインジケータは手元に何も出せないときだけ出す（`src/lib/query-client.ts` の
 * `useIsLoadingWithoutCache`）。どの画面もマウントのたびに裏で取り直すので、取り直しまで数えると
 * 移動のたびに毎回出てしまう。一度見た画面へ戻る場面で、遅らせた取り直しの最中を捕まえて確かめる。
 */
test('一度見た画面に戻るときは、キャッシュを即座に出してインジケータを出さない', async ({
  page,
}) => {
  await login(page);
  await page.getByRole('link', { name: '立替' }).click();
  await expect(page.getByLabel('立替を検索')).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  const cached = await page.locator('main').textContent();

  // ここから先の取り直しは返さない（裏で取っている最中を捕まえるため）
  await stall(page, '**/api/expenses');

  await page.getByRole('link', { name: 'ホーム' }).click();
  await expect(page.getByRole('heading', { name: '今日' })).toBeVisible();
  const refetch = page.waitForRequest(
    (request) => new URL(request.url()).pathname === '/api/expenses',
  );
  await page.getByRole('link', { name: '立替' }).click();
  await refetch;

  // 取り直しの最中でも、履歴は最初から出ていて骨組みもインジケータも出ない
  await expect(page.locator('main')).toHaveText(cached ?? '');
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page.getByRole('progressbar')).toHaveCSS('opacity', '0');
});

/**
 * ユーザー（名前と色）は 1 時間取り直さない（`src/features/users/queries.ts` の `staleTime`）。
 * 色と名前を読む部品は画面中に散らばっているので、staleTime が戻ると画面を移るたびに取り直しが走る。
 * 回数で押さえる。
 */
test('ユーザーは画面を移っても取り直さない', async ({ page }) => {
  const fetches = countFetches(page, '/api/users');

  await login(page);
  await expect(page.getByRole('heading', { name: '今日' })).toBeVisible();
  // 名前と色を読む画面を一通り開く。移った先が出るまで待つ（部品がマウントされて初めて取り直しが走る）
  const visit = async (name: string, arrived: Locator) => {
    await page.getByRole('link', { name }).click();
    await expect(arrived).toBeVisible();
  };
  await visit('立替', page.getByLabel('立替を検索'));
  await visit('レモン', page.getByLabel('メモを検索'));
  await visit('予定', page.getByRole('button', { name: '表示の切替' }));
  await visit('ホーム', page.getByRole('heading', { name: '今日' }));
  // 戻ってきたときも取り直さない
  await visit('立替', page.getByLabel('立替を検索'));
  await quiet(page, fetches);

  expect(fetches()).toBe(1);
});
