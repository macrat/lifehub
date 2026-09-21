import { devices, expect, test } from '@playwright/test';
import { E2E_USER } from './global-setup.ts';

test.use({ ...devices['Pixel 7'] });

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(E2E_USER.email);
  await page.getByLabel('パスワード').fill(E2E_USER.password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page).toHaveURL('/');
});

test('スマホでは追加フォームが全画面で開き、保存すると一覧の再取得を待たずに閉じる', async ({
  page,
}) => {
  await page.goto('/lemon');
  await expect(page.getByText('水やり').first()).toBeVisible();

  await page.getByRole('button', { name: 'レモンの記録を追加' }).click();

  // ページが切り替わったように、画面いっぱい・戻る矢印つきで開く
  // 右から差し込むので、収まりきるまで待つ
  const viewport = page.viewportSize();
  await expect
    .poll(() => page.locator('.MuiDialog-paper').boundingBox())
    .toMatchObject({ x: 0, y: 0, width: viewport?.width, height: viewport?.height });
  await expect(page.getByRole('button', { name: '戻る' })).toBeVisible();

  // 保存後の再取得（GET）だけを詰まらせても、保存（POST）が終われば閉じる
  await page.route('**/api/lemon/**', async (route) => {
    if (route.request().method() === 'GET') {
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
    await route.continue();
  });
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 3000 });
});
