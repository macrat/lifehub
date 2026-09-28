import { expect, test } from '@playwright/test';
import { myId } from './auth.ts';
import { E2E_USER } from './global-setup.ts';

test('ユーザーの編集画面にユーザー ID が出て、押すとコピーできる', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const id = await myId(page);

  await page.goto('/admin/users');
  await page.getByRole('button', { name: `${E2E_USER.name} を編集` }).click();
  const field = page.getByLabel('ユーザー ID');
  await expect(field).toHaveValue(id);
  await expect(field).not.toBeEditable();

  await field.click();
  await expect(page.getByText('ユーザー ID をコピーしました')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(id);
});
