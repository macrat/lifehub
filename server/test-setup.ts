// サーバーテストの環境変数。ローカル・CI とも compose.yaml の Postgres を使う。
process.env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:5432/lifehub';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-test-secret-test-secret-0000';
process.env.APP_URL ??= 'http://localhost:5173';
process.env.CRON_SECRET ??= 'test-cron-secret';
