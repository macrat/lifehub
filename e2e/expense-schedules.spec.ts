import { addDays, today } from '../shared/date.ts';
import { detailAction } from './detail.ts';
import { expect, test } from './test.ts';

/**
 * 立替スケジュール（設定 → お金 → 立替スケジュール）。日が来た回の記録（日次の Cron）はサーバーのテスト
 * （`server/features/money/__tests__/schedule.test.ts`）が確かめるので、ここでは画面からの追加・変更・削除と、
 * 追加したその場で今日までの回が立替として記録されることを確かめる。
 */
test('立替スケジュールを設定から追加すると今日までの回が記録され、変更・削除できる', async ({
  page,
}) => {
  const description = `E2E 定期入金 ${Date.now()}`;
  await page.goto('/settings');
  await page.getByRole('link', { name: '立替スケジュール' }).click();
  await expect(page).toHaveURL('/admin/expense-schedules');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('立替スケジュール');

  // 昨日から毎日: 昨日と今日の 2 回がその場で記録される
  await page.getByRole('button', { name: '立替スケジュールを追加' }).click();
  await page.getByLabel('最初の日').fill(addDays(today(), -1));
  await page.getByLabel('繰り返し').click();
  await page.getByRole('option', { name: '毎日' }).click();
  await page.getByLabel('金額（円）').fill('5000');
  await page.getByLabel('内容', { exact: true }).fill(description);
  await page.getByRole('button', { name: '保存' }).click();
  const row = page.getByRole('main').getByRole('listitem').filter({ hasText: description });
  await expect(row).toContainText('毎日');

  // 鉛筆で変えると並びも変わる（まだ記録していない回にだけ効く）
  await page.getByRole('button', { name: `${description} を編集` }).click();
  await page.getByLabel('金額（円）').fill('6000');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(row).toContainText('¥6,000');

  await page.goto('/money');
  await expect(page.getByText(description)).toHaveCount(2);

  // 削除しても記録した立替は残る
  await page.goto('/admin/expense-schedules');
  await page.getByRole('button', { name: `${description} を編集` }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await detailAction(page, '削除');
  await expect(row).toHaveCount(0);
  await page.goto('/money');
  await expect(page.getByText(description)).toHaveCount(2);

  // 後片付け: 記録した立替を消す（同じ worker の精算を確かめるテストに残さない）
  page.on('dialog', (dialog) => dialog.accept());
  for (const remaining of [1, 0]) {
    await page.getByRole('button', { name: description }).first().click();
    await detailAction(page, '削除');
    await expect(page.getByText(description)).toHaveCount(remaining);
  }
});
