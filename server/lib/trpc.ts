import * as Sentry from '@sentry/hono/node';
import { initTRPC, TRPCError } from '@trpc/server';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import type { AuthUser } from './auth.ts';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors.ts';

/**
 * 画面の API（tRPC）の土台。画面専用の API は tRPC の手続き（procedure）にし、同じ時点に出た問い合わせを
 * クライアントの `httpBatchLink` が 1 本の要求にまとめる（`src/lib/api.ts`）。サーバーは 1 本の要求の中の
 * 手続きを並べて実行するので、DB の問い合わせも 1 往復にまとまる（`lib/db/coalesce-reads.ts`）。
 * 外と約束した口（better-auth・MCP・ics の配信・記録投入・Cron・QStash）は Hono のまま（`server/app.ts`）。
 *
 * コンテキストはログイン中のユーザー（の Promise。`lib/middleware.ts` の `requireSession`）。読み出しは
 * セッションの検証と並べて走るので、ユーザーが要る手続きだけが `await ctx.user` で待つ。
 */
type TrpcContext = {
  user: Promise<AuthUser>;
  /** 要求の User-Agent（プッシュの購読に端末の名前として残す） */
  userAgent: string | null;
};

const t = initTRPC.context<TrpcContext>().create({
  /**
   * 失敗の文言は画面にそのまま出す。入力の検証の失敗は最初の問題の文言だけにする（既定は Zod の問題の
   * 一覧を JSON にした文字列になる）。想定外の失敗は中身（SQL 文など）を見せない
   */
  errorFormatter: ({ shape, error }) =>
    error.cause instanceof ZodError
      ? { ...shape, message: error.cause.issues[0]?.message ?? '入力が正しくありません' }
      : error.code === 'INTERNAL_SERVER_ERROR'
        ? { ...shape, message: 'サーバーエラーが発生しました' }
        : shape,
});

/**
 * service が投げる業務エラー（`lib/errors.ts`）と、ログインの検証の失敗（`await ctx.user` の 401）を、
 * tRPC の失敗の種類に置き換える。残るのは想定外の失敗（INTERNAL_SERVER_ERROR）だけになり、
 * それだけを報告する（`server/app.ts` の `onError`）
 */
const domainErrors = t.middleware(async ({ next }) => {
  const result = await next();
  if (result.ok) return result;
  const { cause } = result.error;
  const code =
    cause instanceof NotFoundError
      ? 'NOT_FOUND'
      : cause instanceof ForbiddenError
        ? 'FORBIDDEN'
        : cause instanceof ConflictError
          ? 'CONFLICT'
          : cause instanceof ValidationError
            ? 'BAD_REQUEST'
            : cause instanceof HTTPException && cause.status === 401
              ? 'UNAUTHORIZED'
              : null;
  if (!code) return result;
  throw new TRPCError({ code, message: cause?.message ?? '', cause });
});

/**
 * 手続きごとに Sentry のスパンを作る（名前は `trpc/timeline.get` のような手続きの名前）。1 本の要求に
 * いくつもの手続きが載るので、どの手続きに時間が掛かったかを手続きの単位で見られるようにする。
 * WHY NOT `Sentry.trpcMiddleware`: 失敗をすべて（業務エラーや入力の検証の失敗も）報告する。エラーの報告は
 * `console.error` の 1 経路にまとめている（`lib/sentry.ts`）ので、スパンだけを作る
 */
const traced = t.middleware(({ path, type, next }) =>
  Sentry.startSpan(
    {
      name: `trpc/${path}`,
      op: 'rpc',
      attributes: { 'rpc.method': path, 'trpc.procedure_type': type },
    },
    () => next(),
  ),
);

export const router = t.router;
export const procedure = t.procedure.use(traced).use(domainErrors);
