import { expect, test } from '@playwright/test';
import { E2E_USER } from './global-setup.ts';

test('オフラインでも 2 回目以降はキャッシュから起動し、記録はオンラインに戻ったときに送られる', async ({
  page,
  context,
}) => {
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(E2E_USER.email);
  await page.getByLabel('パスワード').fill(E2E_USER.password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: '今日' })).toBeVisible();

  // Service Worker の precache と TanStack Query の永続化が終わるのを待つ
  await page.waitForFunction(
    "navigator.serviceWorker.getRegistration().then((r) => r?.active?.state === 'activated')",
  );
  await page.goto('/lemon');
  await expect(page.getByText('水やり').first()).toBeVisible();
  await page.waitForTimeout(1500);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('水やり').first()).toBeVisible();
  await expect(page.getByText('オフラインです', { exact: false })).toBeVisible();

  // オフラインでも記録でき、その場で一覧に出る
  await page.getByRole('button', { name: 'レモンの記録を追加' }).click();
  await page.getByRole('textbox', { name: 'メモ' }).fill('オフラインで記録した');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('オフラインで記録した')).toBeVisible();
  await expect(page.getByText('未送信 1 件', { exact: false })).toBeVisible();

  // 閉じて開き直しても（永続化キャッシュからの復元）記録は残っている
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.getByText('オフラインで記録した')).toBeVisible();

  // アプリを閉じている間にオンラインへ戻っても、次に開いたときに送られる
  await page.goto('about:blank');
  await context.setOffline(false);
  const sent = page.waitForResponse(
    (res) => res.url().endsWith('/api/lemon/logs') && res.request().method() === 'POST',
  );
  await page.goto('/lemon');
  expect((await sent).ok()).toBe(true);

  // 送った後はサーバーの一覧にも入っている
  const listed = await page.waitForResponse(
    (res) => res.url().endsWith('/api/lemon/logs') && res.request().method() === 'GET' && res.ok(),
  );
  expect(((await listed.json()) as { note: string | null }[]).map((log) => log.note)).toContain(
    'オフラインで記録した',
  );
  await expect(page.getByText('オフラインです', { exact: false })).toBeHidden();
});
