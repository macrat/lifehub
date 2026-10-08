import { countFetches, quiet } from './network.ts';
import { expect, test } from './test.ts';
import { changeView, recordViewTransitions } from './view.ts';

/**
 * カレンダーの項目（と同じ応答に載る祝日・天気）を取り直すのは画面に入ったときだけ
 * （`src/features/calendar/queries.ts` の `useRefreshCalendarItems`）。月のキャッシュが古くならないことに支えられているので、
 * `staleTime` が戻ると表示を切り替えるたびに静かに通信が増える。回数で押さえる。
 */

test('表示を切り替えても取り直さず、画面に入ったときだけ取り直す', async ({ page }) => {
  const fetches = countFetches(page, 'calendar.get');
  // 表示の切り替えを待つのに使う（`view.ts`）。仕込むのは最初の遷移より前
  await recordViewTransitions(page);

  // 月表示で入る（前後の月の面も読むので、どの表示に切り替えても必要な月は揃っている）
  await page.goto('/calendar?view=month&date=2030-05-15');
  await expect(page.getByText('2030年05月')).toBeVisible();
  await quiet(page, fetches);

  // 表示の切り替えでは 1 件も取りに行かない（リストは端へ近づくと前後の月を読み足す無限スクロールなので数えない）
  const afterEnter = fetches();
  for (const label of ['週', '日', '月'] as const) {
    await changeView(page, label);
  }
  await quiet(page, fetches);
  expect(fetches()).toBe(afterEnter);

  // 別の画面との行き来では取り直す
  await page.getByRole('link', { name: 'ホーム' }).click();
  await expect(page).toHaveURL('/');
  await page.getByRole('link', { name: '予定' }).click();
  await expect(page).toHaveURL(/\/calendar/);
  await expect.poll(fetches).toBeGreaterThan(afterEnter);
  await quiet(page, fetches);
  const afterReturn = fetches();

  // 再読み込みでも取り直す
  await page.reload();
  await expect.poll(fetches).toBeGreaterThan(afterReturn);
});
