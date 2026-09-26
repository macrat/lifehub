import { expect, test as setup } from '@playwright/test';
import { AUTH_FILE } from './auth.ts';
import { E2E_USER } from './global-setup.ts';

/**
 * E2E ユーザーでログインし、その状態を保存する（各テストはここから始まる）。
 * 画面からのログインは smoke.spec.ts が確かめるので、ここは API で済ませる。
 * セッションは 90 日持つ（`server/lib/auth.ts`）ので、E2E 全体の間に切れることはない。
 */
setup('E2E ユーザーでログインしておく', async ({ request }) => {
  const res = await request.post('/api/auth/sign-in/email', {
    data: { email: E2E_USER.email, password: E2E_USER.password },
  });
  expect(res.ok(), await res.text()).toBe(true);
  await request.storageState({ path: AUTH_FILE });
});
