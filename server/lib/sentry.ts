import * as Sentry from '@sentry/hono/node';
import { waitUntil } from '@vercel/functions';
import { type Env, Hono, type MiddlewareHandler, type Schema } from 'hono';
import { z } from 'zod';
import { SENTRY_DATA_COLLECTION, sentryUser } from '../../shared/sentry.ts';
import { env } from './env.ts';

/**
 * サーバーのエラー・トレース・ログを Sentry に送る。DSN（本番だけが持つ。`infra/vercel.tf`）が無ければ何もしない。
 * Vercel Function のエントリ（`api/index.ts`）が 1 度だけ呼ぶ。
 *
 * - エラー: `console.error` に出したものすべて（`captureConsoleIntegration`）。想定外のエラーは共通のエラー
 *   ハンドラ（`server/app.ts`）、応答の後の処理（`after-response.ts`）、通知の予約と送信でそれぞれ
 *   `console.error` に出しているので、報告の呼び出しを個々に足さずに済み、足し忘れもない。業務エラー（404 や
 *   409 など）は `console.error` に出さないので送られない。
 * - トレース: 要求 1 つにつき、ルート名（`GET /api/events/:id`）のスパンと、その下のミドルウェア・Neon への
 *   問い合わせ（SQL 文。下の `traceNeonFetch`）・外部への要求のスパン。要求のスパンには、インスタンスが起きて
 *   最初の要求かどうか（`faas.coldstart`）を付け、最初の要求には起動のスパンを足す（下の `markColdStart`）。ブラウザから来たトレースを引き継ぐ。
 *   すべて送る（`tracesSampleRate: 1`。無料枠に収まる見積もりは docs/operations.md の「監視（Sentry）」）。
 * - ログ: `console` に出したものすべて（`consoleLoggingIntegration`）。
 *
 * WHY NOT `--import` での起動（`@sentry/hono` の案内）: Vercel Function のエントリに置けない。それが要るのは
 * 依存パッケージを読み込み時に書き換える計測だけで、要求のスパンと fetch のスパンは Node 標準の
 * diagnostics_channel で取れる。DB は Neon の HTTP ドライバ（fetch）なので、書き換えは要らない。
 */
export function initSentry(): void {
  // DSN の無い環境（Preview）では SDK を起こさない（console の差し替えや計測だけが動いて何も送らないため）
  if (!env.SENTRY_DSN) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.VERCEL_ENV,
    tracesSampleRate: 1,
    dataCollection: SENTRY_DATA_COLLECTION,
    integrations: [
      Sentry.captureConsoleIntegration({ levels: ['error'] }),
      Sentry.consoleLoggingIntegration(),
      // Vercel の実行環境が関数の生存確認に送る要求（`/_vercel/ping`）は、関数が起きている間 1 分に 20 回ほど届く。
      // スパンにすると月に 100 万近くになり、アプリの要求より桁違いに多く無料枠を食うので計らない
      Sentry.httpIntegration({ ignoreIncomingRequests: (path) => path.startsWith('/_vercel/') }),
    ],
    // Node の警告（`(node:4) ExperimentalWarning: ...`）は Vercel の実行環境が起動のたびに console.error へ出す。
    // 不具合ではないのに、エラーとして送ると起動のたびに 1 件ずつ日ごとの上限を減らすので送らない
    ignoreErrors: [/^\(node:\d+\) \w*Warning: /],
  });
  /**
   * Vercel Function は応答を返すと止まりうるので、送信が終わるまで `waitUntil` で生かしておく。
   * SDK が自分で待つのは Edge ランタイムだけで、Node ランタイムでは送りかけのまま止まる。
   * エラーは溜めずにすぐ送るので、送る直前（beforeEnvelope）に待ち始めれば、応答の後の処理で起きたエラーも
   * 取りこぼさない。溜めてから送るスパンとログは下の `flushAfterRequest` が送り出すので、ここでは待たない
   * （その flush が送る封筒でもここが呼ばれ、同じ送信を待つ flush が重なるだけになる）。
   */
  Sentry.getClient()?.on('beforeEnvelope', ([, items]) => {
    if (items.some(([header]) => header.type === 'event')) waitUntil(Sentry.flush(2000));
  });
}

/**
 * この要求を送ったユーザーを Sentry に知らせる（`sentryUser`）。ログインが要る経路の認証（`requireSession` と
 * MCP のアクセストークンの検証）が呼ぶ。
 * SDK が要求ごとに作る isolation scope に置くので、同じインスタンスが並べて受けた別の要求には混ざらない。
 */
export function setSentryUser(userId: string): void {
  Sentry.setUser(sentryUser(userId));
}

/**
 * Neon の HTTP ドライバが送る本文。問い合わせ 1 つか、`runBatch`（`server/lib/db/client.ts`）の
 * トランザクションなら複数の文。SQL-over-HTTP の形で、`params` に値が別に入る。
 */
const neonRequestSchema = z.union([
  z.object({ query: z.string() }).transform(({ query }) => [query]),
  z
    .object({ queries: z.array(z.object({ query: z.string() })) })
    .transform(({ queries }) => queries.map(({ query }) => query)),
]);

/** Neon への要求の本文から SQL 文を取り出す。読めないときは空（計らずに送るだけにする） */
export function statementsOf(body: RequestInit['body']): string[] {
  if (typeof body !== 'string') return [];
  try {
    return neonRequestSchema.safeParse(JSON.parse(body)).data ?? [];
  } catch {
    return [];
  }
}

/**
 * Neon への問い合わせ 1 回（HTTP の往復 1 回）を、SQL 文を名前にした DB のスパンで包む。Sentry の
 * 「Queries」で文ごとに回数と時間を集計でき、トレースでどの問い合わせが遅いかが分かる。HTTP のスパンは
 * この下にそのまま残る。
 * SQL 文は Drizzle が値を `$1` などの置き場所にして組み立てたもので、値（記録の中身）は `params` に別にあり、
 * 送らない（`SENTRY_DATA_COLLECTION` の方針どおり）。
 *
 * WHY NOT Drizzle や Neon の計測: Sentry にはどちらの計測も無く、Drizzle の OpenTelemetry の口
 * （`drizzle-orm/tracing`）は何もしない。
 * WHY NOT Drizzle に渡すクライアントを包む: トランザクションは、個々の文の問い合わせ（遅延実行の
 * `NeonQueryPromise`）をまとめて送る作りで、文ごとに包むと送る前に実行されてしまう。fetch なら
 * 1 文でもトランザクションでも、1 回の送信として 1 か所で包める。
 * 計っている要求の中でだけ本文を読む（SDK を起こしていない Preview や、計らない要求では読むだけ無駄になる）。
 */
export const traceNeonFetch: typeof fetch = (input, init) => {
  if (!Sentry.getActiveSpan()?.isRecording()) return fetch(input, init);
  const statements = statementsOf(init?.body);
  if (statements.length === 0) return fetch(input, init);
  const text = statements.join(';\n');
  return Sentry.startSpan(
    {
      name: text,
      op: 'db',
      attributes: {
        'db.system.name': 'postgresql',
        'db.query.text': text,
        ...(statements.length > 1 && { 'db.operation.batch.size': statements.length }),
      },
    },
    () => fetch(input, init),
  );
};

/** このインスタンスがまだ要求を計っていないか。Vercel Function はインスタンスを使い回すので、最初の 1 回だけ真 */
let coldStart = true;

/**
 * モジュールを読み終えた時刻（エポックからのミリ秒）。`withSentry` が記録する。エントリ（`api/index.ts`）が
 * `withSentry` を呼ぶのは、アプリのモジュールをすべて読み込んだ後なので。
 */
let loadedAt: number | undefined;

/**
 * 要求のスパンに、インスタンスが起きて最初の要求かどうか（`faas.coldstart`）を付ける。起動（モジュールの
 * 読み込みや Neon への最初の接続）の分だけ遅い要求を、普段の遅さと分けて見るため。
 * 最初の要求には、プロセスが起きてからモジュールを読み終えるまでのスパン（`function.init`）も子として足す。
 * 要求のスパンは要求が届いてから始まるので、その前の起動の時間はこれが無いとどこにも残らない
 * （ブラウザの計る要求の時間とサーバーの計る時間の差としてしか見えない）。Node の `performance.timeOrigin` は
 * プロセスが起きた時刻。
 * 計らない要求（Vercel の生存確認。`initSentry` の `httpIntegration`）では印を使わない。
 */
const markColdStart: MiddlewareHandler = async (_c, next) => {
  const active = Sentry.getActiveSpan();
  if (active?.isRecording()) {
    const root = Sentry.getRootSpan(active);
    root.setAttribute('faas.coldstart', coldStart);
    if (coldStart && loadedAt !== undefined) {
      Sentry.startInactiveSpan({
        name: 'function init',
        op: 'function.init',
        parentSpan: root,
        startTime: performance.timeOrigin,
      }).end(loadedAt);
    }
    coldStart = false;
  }
  await next();
};

/** 要求のスパンが閉じるのを待つ上限。応答を書き終えれば閉じるので、届かないのは接続が切れたときなど */
const SEGMENT_END_TIMEOUT_MS = 10_000;

/**
 * 要求のスパンが閉じたら、溜めたスパンとログを送り出す。SDK はスパンとログを 5 秒溜めてからまとめて送るが、
 * その間に関数が止まると届かない。要求のスパンは応答を書き終えた後に閉じるので、ミドルウェアの中（応答の前）で
 * 待ち始め、閉じるのを待ってから送る。`waitUntil` は要求の文脈の中で呼ばないと効かないため、閉じたとき
 * （応答を書き終えたときのコールバック）に呼ぶのではなく、ここで先に登録しておく。
 */
const flushAfterRequest: MiddlewareHandler = async (_c, next) => {
  const client = Sentry.getClient();
  const active = Sentry.getActiveSpan();
  if (client && active) {
    const segment = Sentry.getRootSpan(active);
    waitUntil(
      new Promise<void>((resolve) => {
        const timer = setTimeout(done, SEGMENT_END_TIMEOUT_MS);
        const off = client.on('spanEnd', (span) => {
          if (span === segment) done();
        });
        function done() {
          clearTimeout(timer);
          off();
          resolve();
        }
      }).then(() => Sentry.flush(2000)),
    );
  }
  await next();
};

/**
 * Hono アプリを包んで、要求をルート名のスパンにする（`@sentry/hono` のミドルウェア）。`server/app.ts` の
 * アプリはローカル（`server/dev.ts`）とテストも使うので、Sentry を入れるのは本番のエントリで包む外側だけにする。
 * エラーの報告は `console.error` 経由の 1 経路にまとめているので、ミドルウェアからは送らない
 * （`shouldHandleError`。送ると同じエラーが 2 件になり、業務エラーまで送られる）。
 * SDK を起こしていない環境（`initSentry` が DSN の無いときは何もしない）では、アプリをそのまま返す。
 */
export function withSentry<E extends Env, S extends Schema, B extends string>(
  app: Hono<E, S, B>,
): Hono<E, S, B> {
  if (!Sentry.getClient()) return app;
  loadedAt = performance.timeOrigin + performance.now();
  const root = new Hono<E, S, B>();
  root.use(Sentry.sentry(root, { shouldHandleError: () => false }));
  root.use(markColdStart);
  root.use(flushAfterRequest);
  root.route('/', app);
  return root;
}
