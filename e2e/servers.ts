/**
 * E2E のワーカーごとのサーバーと DB。ワーカーは並べて走らせ、それぞれが自分のサーバー（ポート）と DB だけを使う。
 * WHY ワーカーごとに分ける: テストは「今日」の記録の並びや取得の回数を見るので、同じ DB を共有すると
 * 別のワーカーが置いた記録や後片付けに当たって揺れる。分ければテストの中身を並列向けに書き直さずに済む。
 * WHY NOT ワーカーごとのユーザー: 家族のアプリなので記録は全員に見え、ユーザーを分けても記録は分かれない。
 *
 * 並べる数は CI のランナー（4 コア）に合わせる。ワーカー 1 つにブラウザとサーバーが 1 つずつ要る。
 */
export const E2E_WORKERS = 2;

/** ワーカーの番号（`testInfo.parallelIndex`。0 から E2E_WORKERS - 1）ごとのサーバーと DB */
export function serverOf(index: number) {
  const port = 3000 + index;
  return {
    port,
    url: `http://localhost:${port}`,
    databaseUrl: databaseUrlOf(index),
  };
}

/** 接続先の Postgres（compose.yaml）。CI もローカルも DATABASE_URL で差し替えられる */
const BASE_DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/lifehub';

/** ワーカー 0 は compose.yaml の DB をそのまま使い、それ以外は名前に番号を付けた DB を使う */
function databaseUrlOf(index: number): string {
  if (index === 0) return BASE_DATABASE_URL;
  const url = new URL(BASE_DATABASE_URL);
  url.pathname = `${url.pathname}_e2e_${index}`;
  return url.toString();
}

/** サーバーの環境変数（DB と、自分の URL）。サーバーの起動と、E2E の中でサーバーのコードを読み込むときに使う */
export function serverEnv(index: number): Record<string, string> {
  const { port, url, databaseUrl } = serverOf(index);
  return {
    PORT: String(port),
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-000000',
    APP_URL: url,
    CRON_SECRET: 'e2e-cron-secret',
    SERVE_STATIC: '1',
  };
}
