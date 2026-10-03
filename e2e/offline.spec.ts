import { expect, test } from '@playwright/test';
import { openHome } from './auth.ts';
import { offlineIndicator } from './layout.ts';
import { carriedJson, carries } from './network.ts';

test('オフラインでも 2 回目以降はキャッシュから起動し、記録はオンラインに戻ったときに送られる', async ({
  page,
  context,
}) => {
  await openHome(page);

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
  await expect(offlineIndicator(page)).toBeVisible();

  // オフラインでも記録でき、その場で一覧に出る
  await page.getByRole('button', { name: 'レモンの記録を追加' }).click();
  await page.getByRole('textbox', { name: 'メモ' }).fill('オフラインで記録した');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('オフラインで記録した')).toBeVisible();
  await expect(offlineIndicator(page)).toHaveAccessibleName(/未送信 1 件/);

  // 閉じて開き直しても（永続化キャッシュからの復元）記録は残っている
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.getByText('オフラインで記録した')).toBeVisible();

  // アプリを閉じている間にオンラインへ戻っても、次に開いたときに送られる
  await page.goto('about:blank');
  await context.setOffline(false);
  const sent = page.waitForResponse(carries('lemon.create'));
  await page.goto('/lemon');
  expect((await sent).ok()).toBe(true);

  // 送った後はサーバーの一覧にも入っている
  const listed = await page.waitForResponse((res) => carries('lemon.logs')(res) && res.ok());
  const { items } = await carriedJson<{ items: { note: string | null }[] }>(listed, 'lemon.logs');
  expect(items.map((log) => log.note)).toContain('オフラインで記録した');
  await expect(offlineIndicator(page)).toBeHidden();
});

test('オフラインの間は AppBar の左端に印が出て、押すと説明が出る', async ({ page, context }) => {
  await openHome(page);
  await expect(offlineIndicator(page)).toBeHidden();
  await context.setOffline(true);
  await offlineIndicator(page).click();
  await expect(page.getByRole('tooltip')).toHaveText(
    '現在オフラインになっています。変更はオンラインになったときに同期されます',
  );
  await context.setOffline(false);
  await expect(offlineIndicator(page)).toBeHidden();
});
