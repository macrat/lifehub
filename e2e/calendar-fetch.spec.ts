import { expect, type Page, test } from '@playwright/test';
import { E2E_USER } from './global-setup.ts';
import { changeView, recordViewTransitions } from './view.ts';

/**
 * カレンダーの項目を取り直すのは画面に入ったときだけ（`src/features/calendar/queries.ts` の
 * `useRefreshCalendarItems`）。月のキャッシュが古くならないことに支えられているので、
 * `staleTime` が戻ると表示を切り替えるたびに静かに通信が増える。回数で押さえる。
 */

/** 始めてからの `GET /api/events` の回数を返す */
function countFetches(page: Page): () => number {
  let count = 0;
  page.on('request', (request) => {
    if (request.method() === 'GET' && new URL(request.url()).pathname === '/api/events') count++;
  });
  return () => count;
}

/** 取得が落ち着く（1 秒の間 1 件も増えない）まで待つ */
async function quiet(page: Page, fetches: () => number) {
  for (let before = -1; before !== fetches(); ) {
    before = fetches();
    await page.waitForTimeout(1000);
  }
}

test('表示を切り替えても取り直さず、画面に入ったときだけ取り直す', async ({ page }) => {
  const fetches = countFetches(page);
  // 表示の切り替えを待つのに使う（`view.ts`）。仕込むのは最初の遷移より前
  await recordViewTransitions(page);
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(E2E_USER.email);
  await page.getByLabel('パスワード').fill(E2E_USER.password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page).toHaveURL('/');

  // 月表示で入る（前後の月の面も読むので、どの表示に切り替えても必要な月は揃っている）
  await page.goto('/calendar?view=month&date=2030-05-15');
  await expect(page.getByText('2030年05月')).toBeVisible();
  await quiet(page, fetches);

  // 表示の切り替えでは 1 件も取りに行かない
  const afterEnter = fetches();
  for (const label of ['週', '日', 'リスト', '月'] as const) {
    await changeView(page, label);
  }
  await quiet(page, fetches);
  expect(fetches()).toBe(afterEnter);

  // 別の画面との行き来では取り直す
  await page.getByRole('link', { name: 'ホーム' }).click();
  await expect(page).toHaveURL('/');
  await page.getByRole('link', { name: '予定' }).click();
  await expect(page).toHaveURL(/\/calendar/);
  await quiet(page, fetches);
  const afterReturn = fetches();
  expect(afterReturn).toBeGreaterThan(afterEnter);

  // 再読み込みでも取り直す
  await page.reload();
  await expect(page.getByRole('button', { name: '表示の切替' })).toBeVisible();
  await quiet(page, fetches);
  expect(fetches()).toBeGreaterThan(afterReturn);
});
