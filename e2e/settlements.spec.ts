import { expect, test } from './test.ts';

/** お金の画面の精算（`SettlementGrid`） */
test('共有のための立替で「債権者 ← 共有」の精算が出て、タップして記録すると精算済みになる', async ({
  page,
}) => {
  const description = `E2E 旅行 ${Date.now()}`;
  await page.goto('/money');
  await page.getByRole('button', { name: '立替を追加' }).click();
  await page.getByLabel('金額（円）').fill('1000');
  await page.getByLabel('内容', { exact: true }).fill(description);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText(description)).toBeVisible();

  // 共有のために払ったので、共有が E2E に 1000 円の債務を負う
  const settlements = page.getByRole('region', { name: '精算' });
  const card = settlements.getByRole('button', { name: /E2E ← 共有/ });
  await expect(card).toContainText('¥1,000');

  // タップすると、共有（From）から E2E（To）への支払いが入った入力が開く
  await card.click();
  await expect(page.getByLabel('From')).toHaveText('共有');
  await expect(page.getByLabel('To')).toHaveText('E2E');
  await expect(page.getByLabel('金額（円）')).toHaveValue('1,000');
  await expect(page.getByLabel('内容', { exact: true })).toHaveValue('精算');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(settlements.getByText('精算済み')).toBeVisible();
  // 共有からの引き出しは、一覧で「To ← 共有」と出す
  await expect(page.getByText('E2E ← 共有')).toBeVisible();
});
