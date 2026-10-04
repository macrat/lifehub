import type { Page } from '@playwright/test';
import { apiOf } from './api.ts';
import { expect } from './test.ts';

/**
 * ログインしていない状態。ログイン・ログアウトそのものを確かめるテスト（`test.use({ storageState })`）と、
 * ログインを持たないクライアント（API キーで記録するデバイス・ics を読む別のアプリ）を作るのに渡す。
 * Playwright はテストの中で作るコンテキストにも既定でログイン状態を載せるので、明示して外す。
 */
export const SIGNED_OUT = { cookies: [], origins: [] };

/**
 * ホームを開き、出そろうまで待つ。ホームから始まる操作（タブの移動、戻る先がホームであること、
 * ホームの取得の回数）を確かめるテストの始まりに使う。
 */
export async function openHome(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByLabel('記録を検索')).toBeVisible();
}

/** ログイン中のユーザー（E2E ユーザー）の ID（API で項目を用意するときの参加者に使う） */
export async function myId(page: Page): Promise<string> {
  return (await apiOf(page.request).me.get.query()).id;
}
