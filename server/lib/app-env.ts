import type { AuthUser } from './auth.ts';

/** Hono のコンテキストの型: 束ねた要求が中の要求へ渡す値（Bindings）と、認証ミドルウェアがセットする変数 */
export type AppEnv = {
  Bindings: {
    /**
     * 束ねた要求（`/api/batch`）の中の要求で、束ね全体で検証したログイン中のユーザー（`lib/batch.ts`）。
     * アプリの中から `app.request` の env でだけ渡せ、外から来た要求には無い
     */
    batchUser?: Promise<AuthUser>;
  };
  Variables: {
    /**
     * ログイン中のユーザー。読み出しの要求ではセッションの検証と並べてハンドラを走らせるので Promise で持つ
     * （`lib/middleware.ts` の `requireSession`）。書き込みの要求では検証が済んでからハンドラが走る
     */
    user: Promise<AuthUser>;
  };
};
