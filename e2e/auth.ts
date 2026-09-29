import { expect, type Page } from '@playwright/test';
import { query } from './api.ts';

/**
 * E2E のログイン状態。E2E ユーザーでのログインは `auth.setup.ts` が 1 度だけ行い、その Cookie を
 * ここに保存する。各テストはそれを読み込んだ（ログイン済みの）ブラウザで始まる（`playwright.config.ts`）。
 * WHY: 画面からのログインは 1 回数秒かかり、ほぼ全テストの前に繰り返すと全体の時間に直に乗る。
 */
export const AUTH_FILE = 'playwright/.auth/user.json';

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
  return (await query<{ id: string }>(page.request, 'me.get')).id;
}
