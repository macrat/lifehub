// サーバーテストの環境変数。ローカル・CI とも compose.yaml の Postgres を使う。
process.env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:5432/lifehub';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-test-secret-test-secret-0000';
process.env.APP_URL ??= 'http://localhost:5173';
process.env.CRON_SECRET ??= 'test-cron-secret';
// QStash の署名鍵。配信コールバックのテストがこの鍵で署名を作る（server/__tests__/qstash-routes.test.ts）
process.env.QSTASH_CURRENT_SIGNING_KEY ??= 'test-qstash-current-signing-key';
process.env.QSTASH_NEXT_SIGNING_KEY ??= 'test-qstash-next-signing-key';
