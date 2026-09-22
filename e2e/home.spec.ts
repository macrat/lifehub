import { expect, test } from '@playwright/test';
import { login } from './login.ts';

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('ホームからタスクとレモンの記録を追加し、カードに反映される', async ({ page }) => {
  const title = `E2E ホーム ${Date.now()}`;

  await page.getByRole('button', { name: '追加' }).hover();
  await page.getByRole('menuitem', { name: 'タスク' }).click();
  await page.getByLabel('タイトル').fill(title);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText(title)).toBeVisible();

  await page.getByRole('button', { name: '追加' }).hover();
  await page.getByRole('menuitem', { name: 'レモン' }).click();
  await page.getByRole('button', { name: '保存' }).click();
  // 葉水の経過日数が「今日」になる（レモンのカード内）
  await expect(page.getByText('今日', { exact: true }).first()).toBeVisible();

  // タスクをホームから完了にしても、今日完了した分は「今日」の一覧に残る（チェックが入る）
  await page.getByRole('checkbox', { name: `${title} を完了にする` }).click();
  await expect(page.getByRole('checkbox', { name: `${title} を未完了に戻す` })).toBeChecked();
});

test('共有の立替で残高が出て、相手からの支払いを記録すると精算済みになる', async ({ page }) => {
  const description = `E2E 食材 ${Date.now()}`;
  await page.goto('/expenses');
  await page.getByRole('button', { name: '立替を追加' }).click();
  await page.getByLabel('金額（円）').fill('1000');
  await page.getByLabel('内容', { exact: true }).fill(description);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText(description)).toBeVisible();
  // 折半なので相手が 500 円払うと精算
  await expect(page.getByText(/相手 が E2E に支払うと精算/)).toBeVisible();

  // 精算は「相手（From）が E2E（To）に払った」立替として記録する
  await page.getByRole('button', { name: '立替を追加' }).click();
  await page.getByLabel('金額（円）').fill('500');
  await page.getByLabel('内容', { exact: true }).fill('精算');
  await page.getByLabel('From').click();
  await page.getByRole('option', { name: '相手' }).click();
  await page.getByLabel('To').click();
  await page.getByRole('option', { name: 'E2E' }).click();
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('精算済み')).toBeVisible();
});
