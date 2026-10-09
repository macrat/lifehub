import { readFileSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono, type MiddlewareHandler } from 'hono';
import { app } from './app.ts';

/**
 * ローカル起動用。`vite dev` が `/api` と `/.well-known` をここへプロキシする。
 * 環境変数は `pnpm dev` が `.env.local` から読み込む。
 *
 * `SERVE_STATIC=1` のときは `dist/` も配信する（E2E が本番相当の成果物を 1 オリジンで動かすため）。
 * 本番では Vercel が静的配信と SPA フォールバックを担うので、ここでの実装は E2E とローカル確認だけの用途。
 * 配信するファイルには `vercel.json` の全パスへのヘッダ（CSP など）を本番と同じく付け、E2E を本番と同じ制約の下で動かす。
 * 値を書き写さずに `vercel.json` から読むので、ヘッダを変えると E2E もそのまま追従する。
 */
const port = Number(process.env.PORT ?? 3000);

const server = new Hono();
server.route('/', app);
if (process.env.SERVE_STATIC) {
  const vercel: { headers: { source: string; headers: { key: string; value: string }[] }[] } =
    JSON.parse(readFileSync('vercel.json', 'utf8'));
  const headers = vercel.headers.find(({ source }) => source === '/(.*)')?.headers ?? [];
  const vercelHeaders: MiddlewareHandler = async (c, next) => {
    for (const { key, value } of headers) c.header(key, value);
    await next();
  };
  server.use('/*', vercelHeaders);
  server.use('/*', serveStatic({ root: './dist' }));
  // SPA のフォールバックは画面のパスだけ（vercel.json と同じ規則。docs/architecture.md）
  const indexHtml = serveStatic({ root: './dist', path: 'index.html' });
  server.get('/*', (c, next) => (c.req.path.includes('.') ? next() : indexHtml(c, next)));
}

serve({ fetch: server.fetch, port }, (info) => {
  console.log(`API server listening on http://localhost:${info.port}`);
});
