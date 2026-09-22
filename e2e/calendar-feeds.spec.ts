import { expect, test } from '@playwright/test';
import { login } from './login.ts';

/**
 * 配信 URL の発行 → その URL で ics が読める → 失効すると読めなくなる、を通しで確かめる。
 * ics を読むのはログインを持たない別のアプリなので、Cookie を持たないクライアント
 * （`playwright.request.newContext`）で読み、ブラウザのセッションに寄りかかっていないことも見る。
 */
test('発行した配信 URL で ics を読め、失効すると読めなくなる', async ({ page, playwright }) => {
  await login(page);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'カレンダーの配信' })).toBeVisible();

  const issued = page.waitForResponse(
    (res) => res.request().method() === 'POST' && res.url().endsWith('/api/calendar/feeds'),
  );
  await page.getByRole('button', { name: '配信 URL を発行' }).click();
  await page.getByLabel('名前').fill('E2E のカレンダー');
  await page.getByRole('button', { name: '保存' }).click();
  const { url } = (await (await issued).json()) as { url: string };
  await expect(page.getByText('E2E のカレンダー')).toBeVisible();

  const anonymous = await playwright.request.newContext();
  const ics = await anonymous.get(url);
  expect(ics.status()).toBe(200);
  expect(ics.headers()['content-type']).toBe('text/calendar; charset=utf-8');
  expect(await ics.text()).toContain('BEGIN:VCALENDAR');

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'E2E のカレンダー を失効' }).click();
  await expect(page.getByText('E2E のカレンダー')).toBeHidden();
  expect((await anonymous.get(url)).status()).toBe(404);
  await anonymous.dispose();
});
