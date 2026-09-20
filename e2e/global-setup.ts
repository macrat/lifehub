import { execFileSync } from 'node:child_process';

/**
 * E2E 用のユーザーを用意する。テスト DB は playwright.config.ts の webServer と同じ環境変数で接続する。
 * スキーマ適用（drizzle-kit migrate）と、既に存在する場合の重複は許容する。
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

  execFileSync('pnpm', ['exec', 'drizzle-kit', 'migrate'], { stdio: 'inherit' });

  const { createUser } = await import('../server/features/users/service.ts');
  const { ConflictError } = await import('../server/lib/errors.ts');
  try {
    await createUser(E2E_USER);
  } catch (error) {
    if (!(error instanceof ConflictError)) throw error;
  }
}
