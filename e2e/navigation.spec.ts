import type { Locator } from '@playwright/test';
import { openHome } from './auth.ts';
import { skeleton } from './layout.ts';
import { countFetches, quiet, stall } from './network.ts';
import { expect, test } from './test.ts';

/**
 * 画面の移動はデータの到着を待たない（ルートに loader を置かない。src/main.tsx と各ページ）。
 * 待たせてしまうと、その端末で初めて開くタブではタップしても前の画面のまま固まって見える。
 * 取得を遅らせたうえで、移った先の画面がすぐ出て、内容の場所には骨組みが出ることを確かめる。
 */
test('タブの切り替えはデータを待たず、届くまで骨組みを出す', async ({ page }) => {
  await openHome(page);

  // 立替の履歴（この端末ではまだ開いていない＝キャッシュに無い）を、確かめ終わるまで止める
  const release = await stall(page, ['expenses.']);

  await page.getByRole('link', { name: 'お金' }).click();
  await expect(page).toHaveURL('/money');
  // 立替の画面（AppBar の検索窓）が出て、ホームの検索窓は残っていない
  await expect(page.getByLabel('立替を検索')).toBeVisible();
  await expect(page.getByLabel('記録を検索')).toHaveCount(0);
  // 履歴の場所には骨組みが出ていて、届いたら消える
  await expect(skeleton(page)).toBeVisible();
  await release();
  await expect(skeleton(page)).toHaveCount(0);
});

/**
 * ユーザー（名前と色）は `me.get` に載ってきて、5 分は取り直さない（`src/lib/auth.ts` の `meQueryOptions` の
 * `staleTime`）。色と名前を読む部品は画面中に散らばっているので、staleTime が戻ると画面を移るたびに
 * 取り直しが走る。回数で押さえる。開いた直後はログイン状態を確かめるために問い合わせるので、数えるのはホームが出た後から。
 */
test('ユーザーは画面を移っても取り直さない', async ({ page }) => {
  await openHome(page);
  const fetches = countFetches(page, 'me.get');
  // 名前と色を読む画面を一通り開く。移った先が出るまで待つ（部品がマウントされて初めて取り直しが走る）
  const visit = async (name: string, arrived: Locator) => {
    await page.getByRole('link', { name }).click();
    await expect(arrived).toBeVisible();
  };
  await visit('お金', page.getByLabel('立替を検索'));
  await visit('レモン', page.getByLabel('メモを検索'));
  await visit('予定', page.getByRole('button', { name: '表示の切替' }));
  await visit('ホーム', page.getByLabel('記録を検索'));
  // 戻ってきたときも取り直さない
  await visit('お金', page.getByLabel('立替を検索'));
  await quiet(page, fetches);

  expect(fetches()).toBe(0);
});
