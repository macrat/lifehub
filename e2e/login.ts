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

/** E2E ユーザーの ID（API で項目を用意するときの参加者に使う） */
export async function myId(page: Page): Promise<string> {
  const users: { id: string; name: string }[] = await (await page.request.get('/api/users')).json();
  const me = users.find((u) => u.name === 'E2E');
  if (!me) throw new Error('E2E ユーザーが見つからない');
  return me.id;
}
