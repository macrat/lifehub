import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { E2E_USER, PARTNER_USER } from './users.ts';

/**
 * E2E のワーカー 1 つ分の DB を用意する（`global-setup.ts` がワーカーの数だけ別のプロセスで走らせる）。
 * DB が無ければ作り、スキーマを適用（drizzle-kit migrate）し、全テーブルを空にしてから E2E ユーザーと相手ユーザーを作る。
 * 接続先は環境変数 DATABASE_URL（`servers.ts` の serverEnv）。本番では実行できない（scripts/seed-dev.ts と同じガード）。
 * WHY 別のプロセス: サーバーのコードは DB の接続を読み込んだ時点の DATABASE_URL で 1 つだけ作るので、
 * 1 つのプロセスからは 1 つの DB にしか書けない。
 */
if (process.env.VERCEL_ENV === 'production') {
  throw new Error('本番環境では E2E を実行できません');
}

const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
const name = databaseUrl.pathname.slice(1);
const admin = new pg.Client({
  connectionString: Object.assign(new URL(databaseUrl), { pathname: '/postgres' }).toString(),
});
await admin.connect();
const { rowCount } = await admin.query('select 1 from pg_database where datname = $1', [name]);
if (!rowCount) await admin.query(`create database "${name}"`);
await admin.end();

execFileSync('pnpm', ['exec', 'drizzle-kit', 'migrate'], { stdio: 'ignore' });

const { createUser } = await import('../server/features/users/service.ts');
const { clearTables } = await import('../server/lib/db/test-db.ts');
await clearTables();
await createUser(E2E_USER);
await createUser(PARTNER_USER);
process.exit(0);
