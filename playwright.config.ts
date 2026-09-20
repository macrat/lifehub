import { defineConfig, devices } from '@playwright/test';

/**
 * E2E は `vite build` した成果物と `server/dev.ts` を起動して実行する（Preview URL に依存しない）。
 * `server/dev.ts` が dist/ を静的配信するので、Playwright からは 1 つのオリジンに見える。
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
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
  webServer: {
    command: 'pnpm build && pnpm exec tsx server/dev.ts',
    url: 'http://localhost:3000/api/health',
    reuseExistingServer: !process.env.CI,
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/lifehub',
      BETTER_AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-000000',
      APP_URL: 'http://localhost:3000',
      CRON_SECRET: 'e2e-cron-secret',
      SERVE_STATIC: '1',
    },
    timeout: 120_000,
  },
});
