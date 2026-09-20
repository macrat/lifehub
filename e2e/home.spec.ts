import { expect, test } from '@playwright/test';
import { E2E_USER } from './global-setup.ts';

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(E2E_USER.email);
  await page.getByLabel('パスワード').fill(E2E_USER.password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page).toHaveURL('/');
});

test('ホームからタスクとレモンの記録を追加し、カードに反映される', async ({ page }) => {
  const title = `E2E ホーム ${Date.now()}`;

  await page.getByRole('button', { name: '記録を追加' }).hover();
  await page.getByRole('menuitem', { name: 'タスク' }).click();
  await page.getByLabel('タイトル').fill(title);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText(title)).toBeVisible();

  await page.getByRole('button', { name: '記録を追加' }).hover();
  await page.getByRole('menuitem', { name: 'レモン' }).click();
  await page.getByRole('button', { name: '保存' }).click();
  // 水やりの経過日数が「今日」になる（レモンのカード内）
  await expect(page.getByText('今日', { exact: true }).first()).toBeVisible();

  // タスクをホームから完了にすると今日のタスクから消える
  await page.getByRole('checkbox', { name: `${title} を完了にする` }).click();
  await expect(page.getByText(title)).toHaveCount(0);
});

test('立替を追加すると残高が表示され、精算できる', async ({ page }) => {
  const description = `E2E 食材 ${Date.now()}`;
  await page.goto('/expenses');
  await page.getByRole('button', { name: '立替を追加' }).click();
  await page.getByLabel('金額（円）').fill('1000');
  await page.getByLabel('内容').fill(description);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText(description)).toBeVisible();
  await expect(page.getByText(/→ .* に ￥\d/)).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '精算する' }).click();
  await expect(page.getByText('精算済み')).toBeVisible();
});
