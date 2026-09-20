import { app } from '../server/app.ts';

// Vercel Function のエントリ。全 API を 1 関数にまとめる（Hobby の関数数上限を気にしないため）。
// Vercel の Node ランタイムは `fetch` を持つオブジェクトを Web 標準ハンドラとして扱うので、Hono をそのまま export する。
export default app;
