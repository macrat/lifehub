import { app } from '../server/app.ts';
import { initSentry } from '../server/lib/sentry.ts';

// Vercel Function のエントリ。全 API を 1 関数にまとめる（Hobby の関数数上限を気にしないため）。
// /api/* と /.well-known/*（OAuth の探索メタデータ）は vercel.json の rewrite でこの関数（/api）に
// 集約する。rewrite でも関数は元の URL を受け取るので、Hono がパスで振り分けられる。ファイル名を
// [[...route]].ts にしても Vercel CLI は 1 セグメントしか一致させない（/api/auth/sign-in/email が
// 404 になる）ため、rewrite で行う。
// Vercel の Node ランタイムは `fetch` を持つオブジェクトを Web 標準ハンドラとして扱うので、Hono をそのまま export する。

// エラーの報告は本番のこの入口でだけ始める（ローカルの server/dev.ts とテストは Hono アプリを直接使う）。
// トレースを使わないので、他のモジュールより先に読み込む必要は無い。
initSentry();

export default app;
