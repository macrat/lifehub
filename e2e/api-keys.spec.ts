import { SIGNED_OUT } from './auth.ts';
import { expect, test } from './test.ts';

/**
 * API キーの発行 → 発行したときだけキーが見える → そのキーで記録投入用エンドポイントに記録でき、
 * 最後に使われた時刻が出る → 失効すると記録できなくなる、を通しで確かめる。
 * 送った記録の中身は `server/__tests__/records-routes.test.ts` が確かめる。
 * キーを使うのはログインを持たないデバイスなので、Cookie を持たないクライアント
 * （`playwright.request.newContext`）で送り、ブラウザのセッションに寄りかかっていないことも見る。
 */
test('発行した API キーで記録でき、失効すると記録できなくなる', async ({
  page,
  playwright,
  baseURL,
}) => {
  await page.goto('/settings');
  const section = page.getByRole('region', { name: '外部連携' });

  await section.getByRole('button', { name: 'API キーを発行' }).click();
  await page.getByLabel('名前').fill('E2E のボタン');
  await page.getByRole('button', { name: '保存' }).click();
  const key = await page.getByLabel('API キー', { exact: true }).inputValue();
  expect(key).toMatch(/^[\w-]{43}$/);
  await page.getByRole('button', { name: '閉じる' }).click();
  await expect(section.getByText('まだ一度も使われていません')).toBeVisible();

  const device = await playwright.request.newContext({ baseURL, storageState: SIGNED_OUT });
  const post = (body: unknown) =>
    device.post('/api/records', { data: body, headers: { authorization: `Bearer ${key}` } });
  expect(
    (await post({ type: 'lemon', careTypes: ['mist', 'water'], note: 'E2E のボタン' })).status(),
  ).toBe(201);

  await page.goto('/settings');
  await expect(section.getByText('最後に使われたのは', { exact: false })).toBeVisible();
  page.once('dialog', (dialog) => void dialog.accept());
  await section.getByRole('button', { name: 'E2E のボタン を失効' }).click();
  await expect(section.getByText('E2E のボタン')).toBeHidden();
  expect((await post({ type: 'lemon', careTypes: ['mist'] })).status()).toBe(401);
  await device.dispose();
});
