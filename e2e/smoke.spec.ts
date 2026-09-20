import { expect, test } from '@playwright/test';
import { E2E_USER } from './global-setup.ts';

test('API が DB に接続できる', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({ ok: true, db: true });
});

test('未ログインではログイン画面に送られ、ログインするとホームが表示される', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel('メールアドレス').fill(E2E_USER.email);
  await page.getByLabel('パスワード').fill('wrong-password-123');
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page.getByText('メールアドレスまたはパスワードが違います')).toBeVisible();

  await page.getByLabel('パスワード').fill(E2E_USER.password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByText('次の予定')).toBeVisible();

  // 設定 → ユーザー管理へ移動し、自分が一覧に出る
  await page.getByRole('link', { name: '設定' }).click();
  await page.getByRole('link', { name: /ユーザー管理/ }).click();
  await expect(page).toHaveURL('/admin/users');
  await expect(page.getByText(E2E_USER.email)).toBeVisible();

  // 設定からログアウトするとログイン画面に戻る
  await page.getByRole('link', { name: '設定' }).click();
  await page.getByRole('button', { name: /ログアウト/ }).click();
  await expect(page).toHaveURL(/\/login/);
});

test('設定画面が表示される', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(E2E_USER.email);
  await page.getByLabel('パスワード').fill(E2E_USER.password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page).toHaveURL('/');
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'プッシュ通知' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'この端末で通知を受け取る' })).toBeVisible();
  await expect(page.getByRole('slider', { name: '色' })).toBeVisible();
});
