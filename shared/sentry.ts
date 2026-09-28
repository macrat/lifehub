/**
 * Sentry の SDK が自動で集めるもののうち、送らないもの（サーバー `server/lib/sentry.ts` とブラウザ
 * `src/lib/sentry.ts` の共通）。SDK の既定は要求・応答の本文やクエリ文字列まで集めるが、家庭の記録
 * （予定・立替の金額・メモ）やパスワード、OAuth の認可コードを外のサービスに渡さない。
 * 何が起きたかはスパンの名前（ルート）・所要時間・ステータスとスタックトレースで追えるので、中身は要らない。
 */
export const SENTRY_DATA_COLLECTION = {
  /** IP アドレスなど。誰の操作かは DB のユーザー ID（`server/lib/sentry.ts` の `setSentryUser`）で分かるので要らない */
  userInfo: false,
  /** セッションの Cookie */
  cookies: false,
  /** 要求・応答の本文。記録の中身と、Neon への問い合わせ（HTTP で送る SQL と引数）を含む */
  httpBodies: [],
  /** OAuth の認可コードや検索のキーワード */
  urlQueryParams: false,
  /** DB の問い合わせの引数と結果 */
  databaseQueryData: false,
  /** 例外が起きた時点のローカル変数。記録の中身を持っていることが多い */
  stackFrameVariables: false,
};
