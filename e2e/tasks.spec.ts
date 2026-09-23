import { expect, test } from '@playwright/test';
import { detailAction } from './detail.ts';
import { login } from './login.ts';

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('タスクを追加し、カレンダーのリスト表示から完了にできる', async ({ page }) => {
  const title = `E2E タスク ${Date.now()}`;
  await page.goto('/calendar?view=list');

  await page.getByRole('button', { name: '追加' }).hover();
  await page.getByRole('menuitem', { name: 'タスク' }).click();
  await page.getByLabel('タイトル').fill(title);
  // 日時は既定で空欄なので、タイトルだけで保存できる
  await expect(page.getByRole('textbox', { name: '開始日時' })).toHaveValue('');
  await page.getByRole('button', { name: '保存' }).click();

  // 開始日時なしのタスクは今日の位置に出る
  await expect(page.getByText(title)).toBeVisible();
  // チェックボックスはサーバーの結果で制御されるので、click して結果を待つ（check は即時の状態変化を要求する）
  await page.getByRole('checkbox', { name: `${title} を完了にする` }).click();
  await expect(page.getByRole('checkbox', { name: `${title} を未完了に戻す` })).toBeChecked();

  // 詳細から削除
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByText(title).click();
  await detailAction(page, '削除');
  await expect(page.getByText(title)).toHaveCount(0);
});

test('終日のタスクを追加すると、期限日だけを持つタスクとして出る', async ({ page }) => {
  const title = `E2E 終日タスク ${Date.now()}`;
  await page.goto('/calendar?view=list');

  await page.getByRole('button', { name: '追加' }).hover();
  await page.getByRole('menuitem', { name: 'タスク' }).click();
  await page.getByLabel('タイトル').fill(title);
  await page.getByLabel('終日').check();
  // 終日では日付だけを入れる
  await expect(page.getByLabel('期限日', { exact: true })).toHaveAttribute('type', 'date');
  await page.getByRole('button', { name: '保存' }).click();

  const row = page.getByText(title);
  await expect(row).toBeVisible();
  await row.click();
  page.once('dialog', (dialog) => dialog.accept());
  await detailAction(page, '削除');
  await expect(page.getByText(title)).toHaveCount(0);
});
