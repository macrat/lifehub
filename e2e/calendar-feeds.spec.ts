import { expect, test } from '@playwright/test';
import { apiOf } from './api.ts';
import { SIGNED_OUT } from './auth.ts';
import { carries } from './network.ts';

/**
 * 配信 URL の発行 → その URL で ics が読める → 名前と参加者を変えても同じ URL のまま
 * → 失効すると読めなくなる、を通しで確かめる。
 * ics を読むのはログインを持たない別のアプリなので、Cookie を持たないクライアント
 * （`playwright.request.newContext`）で読み、ブラウザのセッションに寄りかかっていないことも見る。
 */
test('発行した配信 URL で ics を読め、編集しても URL は変わらず、失効すると読めなくなる', async ({
  page,
  playwright,
}) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: '外部連携' })).toBeVisible();

  await page.getByRole('button', { name: '配信 URL を発行' }).click();
  await page.getByLabel('名前').fill('E2E のカレンダー');
  // 既定は全員。相手を外して、自分の予定だけを配る URL にする
  await page.getByRole('checkbox', { name: '相手' }).uncheck();
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('E2E のカレンダー')).toBeVisible();
  // 発行は値を返さないので、画面と同じく一覧から読む
  const feeds = await apiOf(page.request).calendarFeeds.list.query();
  const url = feeds.find((feed) => feed.name === 'E2E のカレンダー')?.url ?? '';
  await expect(page.getByText('E2E の予定・', { exact: false })).toBeVisible();

  const anonymous = await playwright.request.newContext({ storageState: SIGNED_OUT });
  const ics = await anonymous.get(url);
  expect(ics.status()).toBe(200);
  expect(ics.headers()['content-type']).toBe('text/calendar; charset=utf-8');
  expect(await ics.text()).toContain('BEGIN:VCALENDAR');

  // 鉛筆から名前と参加者を変える。渡した先が登録し直さずに済むよう、URL は変わらない
  const updated = page.waitForResponse(carries('calendarFeeds.update'));
  await page.getByRole('button', { name: 'E2E のカレンダー を編集' }).click();
  await page.getByLabel('名前').fill('2 人のカレンダー');
  await page.getByRole('checkbox', { name: '相手' }).check();
  await page.getByRole('button', { name: '保存' }).click();
  expect((await updated).ok()).toBe(true);
  await expect(page.getByText('E2E・相手 の予定・', { exact: false })).toBeVisible();
  expect((await anonymous.get(url)).status()).toBe(200);

  // 一覧からは先に消える（書き込みの結果を先に出す）ので、失効がサーバーに届いてから読む
  const revoked = page.waitForResponse(carries('calendarFeeds.revoke'));
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: '2 人のカレンダー を失効' }).click();
  await expect(page.getByText('2 人のカレンダー')).toBeHidden();
  expect((await revoked).ok()).toBe(true);
  expect((await anonymous.get(url)).status()).toBe(404);
  await anonymous.dispose();
});
