import type { AuthUser } from './auth.ts';

/** Hono のコンテキストの型: 認証ミドルウェアがセットする変数 */
export type AppEnv = {
  Variables: {
    /**
     * ログイン中のユーザー。読み出しの要求ではセッションの検証と並べてハンドラを走らせるので Promise で持つ
     * （`lib/middleware.ts` の `requireSession`）。書き込みの要求では検証が済んでからハンドラが走る
     */
    user: Promise<AuthUser>;
  };
};
