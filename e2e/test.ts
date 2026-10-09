import { type BrowserContextOptions, test as base, request } from '@playwright/test';
import { serverOf } from './servers.ts';
import { E2E_USER } from './users.ts';

type StorageState = Exclude<BrowserContextOptions['storageState'], string | undefined>;

/**
 * E2E のテスト。どの spec もここから test を読み込む（`@playwright/test` から直に読み込むと、
 * ワーカーのサーバーにもログインにも繋がらない。lint で止める）。
 *
 * - 送り先（baseURL）は、そのワーカーのサーバー（`servers.ts`）。
 * - ログイン状態は、ワーカーごとに E2E ユーザーで 1 度だけ API でログインして得たもの。各テストはそこから始まる。
 *   WHY: 画面からのログインは 1 回数秒かかり、ほぼ全テストの前に繰り返すと全体の時間に直に乗る。
 *   画面からのログインそのものは smoke.spec.ts が確かめる。セッションは 90 日持つ（`server/lib/auth.ts`）ので、
 *   E2E 全体の間に切れることはない。
 */
export const test = base.extend<
  object,
  { server: ReturnType<typeof serverOf>; signedIn: StorageState }
>({
  server: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright は引数の分割代入から使う fixture を読むので、使わなくても書く
    async ({}, use, workerInfo) => use(serverOf(workerInfo.parallelIndex)),
    { scope: 'worker' },
  ],
  signedIn: [
    async ({ server }, use) => {
      const context = await request.newContext({ baseURL: server.url });
      const res = await context.post('/api/auth/sign-in/email', {
        data: { email: E2E_USER.email, password: E2E_USER.password },
      });
      if (!res.ok()) throw new Error(`E2E ユーザーでログインできない: ${await res.text()}`);
      const state = await context.storageState();
      await context.dispose();
      await use(state);
    },
    { scope: 'worker' },
  ],
  baseURL: async ({ server }, use) => use(server.url),
  // 差し替え（`page.route`）の処理が、テストの終わりにページを閉じた後で応答を読んで落ちないよう、閉じる前に外す。
  // WHY: 終わる直前に出た要求の差し替えは、本物の応答（`route.fetch`）を待っている間にページが閉じると
  // 「Response has been disposed」で落ち、テストは通っていても失敗として数えられる。
  page: async ({ page }, use) => {
    await use(page);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  },
  storageState: async ({ signedIn }, use) => use(signedIn),
});

export { expect } from '@playwright/test';
