import { expect, test } from '@playwright/test';
import { E2E_USER } from './global-setup.ts';

test('オフラインでも 2 回目以降はキャッシュから起動し、書き込みは無効になる', async ({
  page,
  context,
}) => {
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(E2E_USER.email);
  await page.getByLabel('パスワード').fill(E2E_USER.password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'ホーム' })).toBeVisible();

  // Service Worker の precache と TanStack Query の永続化が終わるのを待つ
  await page.waitForFunction(
    "navigator.serviceWorker.getRegistration().then((r) => r?.active?.state === 'activated')",
  );
  await page.goto('/lemon');
  await expect(page.getByRole('heading', { name: 'レモン' })).toBeVisible();
  await page.waitForTimeout(1500);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'レモン' })).toBeVisible();
  await expect(page.getByText('オフラインです', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'レモンの記録を追加' }).click();
  await expect(page.getByRole('button', { name: '保存' })).toBeDisabled();
  await context.setOffline(false);
});
