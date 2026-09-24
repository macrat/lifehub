import { expect, type Page } from '@playwright/test';
import { E2E_USER } from './global-setup.ts';

/**
 * E2E ユーザーでログインし、ホームが出るまで待つ。
 * ほとんどのテストはログイン済みから始まるので、その道のりは 1 か所に持つ。
 */
export async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(E2E_USER.email);
  await page.getByLabel('パスワード').fill(E2E_USER.password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page).toHaveURL('/');
}

/** ログイン中のユーザー（E2E ユーザー）の ID（API で項目を用意するときの参加者に使う） */
export async function myId(page: Page): Promise<string> {
  const me: { id: string } = await (await page.request.get('/api/me')).json();
  return me.id;
}
