import type { Page } from '@playwright/test';
import { openHome } from './auth.ts';
import { OFFLINE_MESSAGE, offlineIndicator } from './layout.ts';
import { carriedJson, carries } from './network.ts';
import { expect, test } from './test.ts';

/**
 * 端末に残したキャッシュ（`src/lib/query-client.ts` の永続化。idb-keyval の既定の DB とストア、キー
 * `lifehub-query-cache`）に、texts がすべて書かれるまで待つ。永続化は変化から 1 秒以内に間を置いて書くので、
 * 書かれる前に読み込み直すと残っていない。DB はアプリが起動時の復元で作り終えている
 */
async function persisted(page: Page, ...texts: string[]) {
  const written = () =>
    page.evaluate(async (texts) => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        indexedDB.open('keyval-store').onsuccess = (event) =>
          resolve((event.target as IDBOpenDBRequest).result);
      });
      const value = await new Promise<unknown>((resolve) => {
        const read = db.transaction('keyval').objectStore('keyval').get('lifehub-query-cache');
        read.onsuccess = () => resolve(read.result);
      });
      db.close();
      return typeof value === 'string' && texts.every((text) => value.includes(text));
    }, texts);
  await expect.poll(written, { intervals: [100] }).toBe(true);
}

test('オフラインでも 2 回目以降はキャッシュから起動し、記録はオンラインに戻ったときに送られる', async ({
  page,
  context,
}) => {
  await openHome(page);
  await expect(offlineIndicator(page)).toBeHidden();

  // Service Worker の precache と TanStack Query の永続化が終わるのを待つ
  await page.waitForFunction(
    "navigator.serviceWorker.getRegistration().then((r) => r?.active?.state === 'activated')",
  );
  await page.goto('/lemon');
  await expect(page.getByText('水やり').first()).toBeVisible();
  await persisted(page, '["lemon","status"]', '["lemon","logs"');

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('水やり').first()).toBeVisible();
  // 印にポインタを重ねると説明が出る
  await offlineIndicator(page).hover();
  await expect(page.getByRole('tooltip')).toHaveText(OFFLINE_MESSAGE);

  // オフラインでも記録でき、その場で一覧に出る
  await page.getByRole('button', { name: 'レモンの記録を追加' }).click();
  await page.getByRole('textbox', { name: 'メモ' }).fill('オフラインで記録した');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('オフラインで記録した')).toBeVisible();
  await expect(offlineIndicator(page)).toHaveAccessibleName(/未送信 1 件/);

  // 閉じて開き直しても（永続化キャッシュからの復元）記録は残っている
  await persisted(page, 'オフラインで記録した');
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
