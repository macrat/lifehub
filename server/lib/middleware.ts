import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from './app-env.ts';
import { auth } from './auth.ts';
import { setSentryUser } from './sentry.ts';

/**
 * セッション Cookie を検証し、ユーザーをコンテキストにセットする。未認証は 401。
 * サーバー側のこの検証が唯一の防御線（クライアントのルートガードは UX のためだけ）。
 */
export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    throw new HTTPException(401, { message: 'ログインが必要です' });
  }
  c.set('user', session.user);
  setSentryUser(session.user.id);
  await next();
};
