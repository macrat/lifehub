import { expect, test } from '@playwright/test';
import { detailAction } from './detail.ts';
import { E2E_USER } from './global-setup.ts';

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(E2E_USER.email);
  await page.getByLabel('パスワード').fill(E2E_USER.password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page).toHaveURL('/');
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
