import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from './app-env.ts';
import { type AuthUser, getAuth } from './auth.ts';
import { setSentryUser } from './sentry.ts';

/** 読み出すだけで何も書き換えない要求（RFC 9110 の safe method のうち、この API が受けるもの） */
const SAFE_METHODS = new Set(['GET', 'HEAD']);

/** セッション Cookie を検証し、ログイン中のユーザーを返す。未認証は 401 */
async function authenticate(headers: Headers): Promise<AuthUser> {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers });
  if (!session) {
    throw new HTTPException(401, { message: 'ログインが必要です' });
  }
  setSentryUser(session.user.id);
  return session.user;
}

/**
 * セッション Cookie を検証し、ログイン中のユーザー（の Promise）をコンテキストにセットする。未認証は 401。
 * サーバー側のこの検証が唯一の防御線（クライアントのルートガードは UX のためだけ）。
 *
 * 読み出し（GET）は、検証を待たずにハンドラを並べて走らせ、両方が終わってから検証の結果で応答を決める
 * （通らなければハンドラの結果を捨てて 401）。検証の問い合わせとハンドラの読み取りが同じ時点に出るので、
 * DB へは 1 往復にまとまり（`lib/db/coalesce-reads.ts`）、検証を待ってから読むより往復が 1 回少ない。
 * ユーザーが要るハンドラは `await c.var.user`（tRPC の手続きは `await ctx.user`）で検証を待つ。
 * 書き込みは今までどおり検証が通ってから走らせる（ログインしていない要求に書き換えさせない）。
 *
 * WHY NOT Cookie に署名付きのセッションを持たせて DB を読まない（better-auth の cookieCache）: 失効
 * （パスワードの変更・ログアウト）が次の要求から効かなくなる（server/lib/auth.ts）。
 */
export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = authenticate(c.req.raw.headers);
  c.set('user', user);
  if (!SAFE_METHODS.has(c.req.method)) {
    await user;
    return next();
  }
  const [verified, handled] = await Promise.allSettled([user, next()]);
  if (verified.status === 'rejected') throw verified.reason;
  if (handled.status === 'rejected') throw handled.reason;
};
