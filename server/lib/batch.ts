import type { AuthUser } from './auth.ts';
import { traceBatchPart } from './sentry.ts';

/** 束ねた要求の中の 1 本の結果。本文は各ルートが返したものをそのまま文字列で運ぶ */
export type BatchPart = { status: number; body: string };

/** 束ねて運べるパス: 画面の API（`/api/` 配下）で、束ね自身ではないもの。`..` などは解決してから見る */
function resolveBatchPath(path: string): string | null {
  const url = new URL(path, 'http://batch.invalid');
  const resolved = `${url.pathname}${url.search}`;
  if (!url.pathname.startsWith('/api/') || url.pathname.startsWith('/api/batch')) return null;
  return resolved;
}

/**
 * 束ねた GET（`GET /api/batch?r=…`）の中の要求を、同じアプリにそれぞれ内部で送って結果を並べる
 * （クライアントの束ねは `src/lib/api.ts` の `apiFetch`）。並びは r の並びと同じ。
 *
 * - 中の要求は並べて走らせる。どれも読み出しで、DB への問い合わせは同じ時点に出るので、まとめて
 *   1 往復になる（`lib/db/coalesce-reads.ts`）。
 * - ログインの検証は束ね全体で 1 回だけ行い、中の要求はその結果（user）を引き継ぐ
 *   （`lib/middleware.ts` の `requireSession` が `c.env.batchUser` を読む。env はアプリの中からしか
 *   渡せないので、外の要求が名乗ることはできない）。中の要求に元の要求の見出し（Cookie など）は渡さない。
 * - 条件付き要求（ETag / 304）は束ねた応答全体に掛かる（`app.ts` の etag）。中の要求には掛けない。
 */
export async function runBatchRequests(
  paths: string[],
  user: Promise<AuthUser>,
  request: (path: string, env: { batchUser: Promise<AuthUser> }) => Response | Promise<Response>,
): Promise<BatchPart[]> {
  return Promise.all(
    paths.map(async (path): Promise<BatchPart> => {
      const resolved = resolveBatchPath(path);
      if (!resolved) return { status: 400, body: '束ねられない要求です' };
      return traceBatchPart(resolved, async () => {
        const res = await request(resolved, { batchUser: user });
        return { status: res.status, body: await res.text() };
      });
    }),
  );
}
