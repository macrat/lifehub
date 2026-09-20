import type { AuthUser } from './auth.ts';

/** 認証ミドルウェアがセットする Hono のコンテキスト変数 */
export type AppEnv = {
  Variables: {
    user: AuthUser;
  };
};
