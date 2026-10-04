import { defineConfig, devices } from '@playwright/test';
import { E2E_WORKERS, serverEnv, serverOf } from './e2e/servers.ts';

/**
 * E2E は `vite build` した成果物と `server/dev.ts` を起動して実行する（Preview URL に依存しない）。
 * `server/dev.ts` が dist/ を静的配信するので、Playwright からは 1 つのオリジンに見える。
 * ワーカーごとに自分のサーバーと DB を持って並べて走る（`e2e/servers.ts`）。送り先とログイン状態は `e2e/test.ts` が決める。
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  workers: E2E_WORKERS,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // 環境に既存の Chromium を使いたいとき（CI 以外）に指定する。未指定なら Playwright 同梱のものを使う。
        launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
      },
    },
  ],
  // 成果物を作るのは最初のサーバーだけ。待つ先は静的配信の index.html で、成果物ができるまでどのサーバーも整わない
  // （DB はサーバーが整ってから `e2e/global-setup.ts` が用意するので、DB に触る /api/health では待たない）
  webServer: Array.from({ length: E2E_WORKERS }, (_, index) => ({
    command: `${index === 0 ? 'pnpm build && ' : ''}pnpm exec tsx server/dev.ts`,
    url: `${serverOf(index).url}/`,
    reuseExistingServer: !process.env.CI,
    env: serverEnv(index),
    timeout: 120_000,
  })),
});
