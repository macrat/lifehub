import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from './app-env.ts';
import { auth } from './auth.ts';
import { env } from './env.ts';

/**
 * セッション Cookie を検証し、ユーザーをコンテキストにセットする。未認証は 401。
 * サーバー側のこの検証が唯一の防御線（クライアントのルートガードは UX のためだけ）。
 */
export const requireSession = createMiddleware<AppEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    throw new HTTPException(401, { message: 'ログインが必要です' });
  }
  c.set('user', session.user);
  await next();
});

/** Vercel Cron からの呼び出しだけを通す（Vercel は `CRON_SECRET` を Bearer トークンとして送る）。それ以外は 401 */
export const requireCronSecret = createMiddleware<AppEnv>(async (c, next) => {
  if (!env.CRON_SECRET || c.req.header('authorization') !== `Bearer ${env.CRON_SECRET}`) {
    throw new HTTPException(401, { message: 'unauthorized' });
  }
  await next();
});
