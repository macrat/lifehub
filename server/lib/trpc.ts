import * as Sentry from '@sentry/hono/node';
import { initTRPC, TRPCError } from '@trpc/server';
import { ZodError } from 'zod';
import { type AuthUser, getAuth } from './auth.ts';
import { domainErrorOf, INTERNAL_ERROR_MESSAGE, issueMessage } from './errors.ts';
import { setSentryUser } from './sentry.ts';

/**
 * 画面の API（tRPC）の土台。画面専用の API は tRPC の手続き（procedure）にし、同じ時点に出た問い合わせを
 * クライアントの `httpBatchLink` が 1 本の要求にまとめる（`src/lib/api.ts`）。サーバーは 1 本の要求の中の
 * 手続きを並べて実行するので、DB の問い合わせも 1 往復にまとまる（`lib/db/coalesce-reads.ts`）。
 * 外と約束した口（better-auth・MCP・ics の配信・記録投入・Cron・QStash）は Hono のまま（`server/app.ts`）。
 *
 * コンテキストはログイン中のユーザー（を検証する関数。下の `createContext`）。検証の扱いは `authed` が決める。
 */
type TrpcContext = {
  /** セッションの検証。最初に呼んだときに始め、同じ要求の中では同じ Promise を返す */
  user: () => Promise<AuthUser>;
  /** 要求の User-Agent（プッシュの購読に端末の名前として残す） */
  userAgent: string | null;
  /** 要求ごとに 1 つだけ作る値の置き場（`perRequest`） */
  scope: Map<symbol, unknown>;
};

/** セッション Cookie を検証し、ログイン中のユーザーを返す。未認証は UNAUTHORIZED（401） */
async function authenticate(headers: Headers): Promise<AuthUser> {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers });
  if (!session) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'ログインが必要です' });
  setSentryUser(session.user.id);
  return session.user;
}

/**
 * 要求 1 本ぶんのコンテキスト。検証は手続きが要るとき（`authed`）に始め、1 本の要求に載った手続きが分け合う。
 * WHY 作った時点で始めない: tRPC はコンテキストを作ってから手続きを探すので、無い手続きの呼び出しでは
 * 誰も検証を待たず、失敗が取りこぼしの reject（unhandledRejection）になる。
 * `authed` が手続きを走らせる直前に始めても、作った時点で始めるのと同じ処理の続きの中で始まるので、
 * 検証と読み取りが DB へ出る時点は変わらない。
 */
export function createContext(req: Request): TrpcContext {
  let user: Promise<AuthUser> | undefined;
  return {
    user: () => {
      user ??= authenticate(req.headers);
      return user;
    },
    userAgent: req.headers.get('user-agent'),
    scope: new Map(),
  };
}

/**
 * 要求ごとに 1 つだけ作る値（1 本の要求に載った手続きが分け合う。カレンダーの読み手など）を返す関数を作る。
 * 値はコンテキストの置き場に入るので、要求が終われば一緒に消え、別の要求とは分け合わない。
 * WHY 置き場をコンテキストに持つ: ミドルウェアがコンテキストを足すと（`next({ ctx })`）別のオブジェクトに
 * なるので、コンテキストそのものを鍵にはできない。置き場は足しても同じものが引き継がれる。
 */
export function perRequest<T>(create: () => T): (ctx: { scope: Map<symbol, unknown> }) => T {
  const key = Symbol();
  return (ctx) => {
    if (!ctx.scope.has(key)) ctx.scope.set(key, create());
    return ctx.scope.get(key) as T;
  };
}

const t = initTRPC.context<TrpcContext>().create({
  /**
   * 失敗の文言は画面にそのまま出す。入力の検証の失敗は最初の問題の文言だけにする（既定は Zod の問題の
   * 一覧を JSON にした文字列になる）。想定外の失敗は中身（SQL 文など）を見せない
   */
  errorFormatter: ({ shape, error }) =>
    error.cause instanceof ZodError
      ? { ...shape, message: issueMessage(error.cause.issues) }
      : error.code === 'INTERNAL_SERVER_ERROR'
        ? { ...shape, message: INTERNAL_ERROR_MESSAGE }
        : shape,
});

/**
 * ログインを必須にする。サーバー側のこの検証が唯一の防御線（クライアントのルートガードは UX のためだけ）。
 * 読み出しは、検証を待たずに手続きを走らせ、検証が通らなければ手続きの結果を捨てて UNAUTHORIZED にする。
 * 検証の問い合わせと手続きの読み取りが同じ時点に出るので、DB へは 1 往復にまとまり
 * （`lib/db/coalesce-reads.ts`）、検証を待ってから読むより往復が 1 回少ない。ユーザーが要る手続きは
 * `userProcedure` で検証を待つ。書き込みは検証が通ってから走らせる（ログインしていない要求に書き換えさせない）。
 *
 * WHY NOT Cookie に署名付きのセッションを持たせて DB を読まない（better-auth の cookieCache）: 失効
 * （パスワードの変更・ログアウト）が次の要求から効かなくなる（`lib/auth.ts`）。
 */
const authed = t.middleware(async ({ ctx, type, next }) => {
  const user = ctx.user();
  if (type === 'mutation') {
    await user;
    return next();
  }
  const result = next();
  await user;
  return result;
});

/** service が投げる業務エラー（`lib/errors.ts`）を、tRPC の失敗の種類に置き換える。残るのは想定外の失敗だけ */
const domainErrors = t.middleware(async ({ next }) => {
  const result = await next();
  if (result.ok) return result;
  const { cause } = result.error;
  const known = domainErrorOf(cause);
  if (!known) return result;
  throw new TRPCError({ code: known.code, message: cause?.message ?? '', cause });
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
export const procedure = t.procedure.use(traced).use(authed).use(domainErrors);

/** 検証を待ってから、ログイン中のユーザーの ID を `ctx.userId` に置く */
const withUserId = t.middleware(async ({ ctx, next }) =>
  next({ ctx: { userId: (await ctx.user()).id } }),
);

/**
 * ログイン中のユーザーの ID を使う手続き（書き込みと、自分の物だけを返す読み出し）。
 * ユーザーが要らない読み出しは、検証と並べて走らせる `procedure` を使う
 */
export const userProcedure = procedure.use(withUserId);
