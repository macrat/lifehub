import { expect, test } from '@playwright/test';
import { E2E_USER } from './global-setup.ts';

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(E2E_USER.email);
  await page.getByLabel('パスワード').fill(E2E_USER.password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page).toHaveURL('/');
});

test('繰り返し予定を作成し、この回だけ変更し、削除できる', async ({ page }) => {
  const title = `E2E 週次 ${Date.now()}`;
  await page.goto('/calendar?view=week&date=2030-01-07');

  // 作成（毎週）
  // SpeedDial はホバーで開く（クリックだと開閉が反転する）
  await page.getByRole('button', { name: '追加' }).hover();
  await page.getByRole('menuitem', { name: '予定' }).click();
  await page.getByLabel('タイトル').fill(title);
  await page.getByLabel('開始').fill('2030-01-07T09:00');
  await page.getByLabel('終了').fill('2030-01-07T10:00');
  await page.getByLabel('繰り返し', { exact: true }).click();
  await page.getByRole('option', { name: '毎週' }).click();
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText(title)).toBeVisible();

  // 翌週に移動しても表示される
  await page.getByRole('button', { name: '次へ' }).click();
  await expect(page.getByText(title)).toBeVisible();

  // この回だけタイトルを変更
  await page.getByText(title).click();
  await page.getByRole('button', { name: '編集' }).click();
  await page.getByRole('button', { name: 'この回だけ' }).click();
  await page.getByLabel('タイトル').fill(`${title}（変更）`);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText(`${title}（変更）`)).toBeVisible();

  // 元の週は変わっていない
  await page.getByRole('button', { name: '前へ' }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();

  // すべて削除
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByText(title, { exact: true }).click();
  await page.getByRole('button', { name: '削除' }).click();
  await page.getByRole('button', { name: /^すべて / }).click();
  // 詳細ダイアログの閉じるアニメーション中はタイトルが 2 か所に見えるので、件数で待つ
  await expect(page.getByText(title, { exact: true })).toHaveCount(0);
});
