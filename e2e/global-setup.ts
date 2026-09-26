import { execFileSync } from 'node:child_process';

/**
 * E2E 用の DB を用意する。テスト DB は playwright.config.ts の webServer と同じ環境変数で接続する。
 * スキーマを適用（drizzle-kit migrate）し、全テーブルを空にしてから E2E ユーザーと相手ユーザーを作る。
 * 立替の残高は登録順の先頭 2 人で計算するため、E2E ユーザーが必ず先頭 2 人に入るようにする。
 * 本番では実行できない（scripts/seed-dev.ts と同じガード）。
 */
export const E2E_USER = {
  email: 'e2e@example.com',
  name: 'E2E',
  password: 'e2e-password-123',
};

export default async function globalSetup() {
  process.env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:5432/lifehub';
  process.env.BETTER_AUTH_SECRET ??= 'e2e-secret-e2e-secret-e2e-secret-000000';
  process.env.APP_URL ??= 'http://localhost:3000';

  if (process.env.VERCEL_ENV === 'production') {
    throw new Error('本番環境では E2E を実行できません');
  }

  execFileSync('pnpm', ['exec', 'drizzle-kit', 'migrate'], { stdio: 'inherit' });

  const { createUser } = await import('../server/features/users/service.ts');
  const { clearTables } = await import('../server/lib/test-db.ts');
  await clearTables();
  await createUser(E2E_USER);
  await createUser({ email: 'partner@example.com', name: '相手', password: 'partner-password-1' });
}
