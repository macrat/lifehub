import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { app } from './app.ts';

/**
 * ローカル起動用。`vite dev` が `/api` をここへプロキシする。
 * 環境変数は `pnpm dev` が `.env.local` から読み込む。
 *
 * `SERVE_STATIC=1` のときは `dist/` も配信する（E2E が本番相当の成果物を 1 オリジンで動かすため）。
 * 本番では Vercel が静的配信と SPA フォールバックを担うので、ここでの実装は E2E とローカル確認だけの用途。
 */
const port = Number(process.env.PORT ?? 3000);

const server = new Hono();
// 本番では vercel.json の rewrite が担う（OAuth の探索メタデータ）
server.all('/.well-known/*', (c) => {
  const url = new URL(c.req.url);
  url.pathname = url.pathname.replace(/^\/\.well-known\//, '/api/well-known/');
  return app.fetch(new Request(url, c.req.raw));
});
server.route('/', app);
if (process.env.SERVE_STATIC) {
  server.use('/*', serveStatic({ root: './dist' }));
  server.get('/*', serveStatic({ root: './dist', path: 'index.html' }));
}

serve({ fetch: server.fetch, port }, (info) => {
  console.log(`API server listening on http://localhost:${info.port}`);
});
