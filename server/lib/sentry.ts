import * as Sentry from '@sentry/hono/node';
import { waitUntil } from '@vercel/functions';
import { type Env, Hono, type MiddlewareHandler, type Schema } from 'hono';
import { SENTRY_DATA_COLLECTION } from '../../shared/sentry.ts';
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
 *   問い合わせ（HTTP）・外部への要求のスパン。ブラウザから来たトレースを引き継ぐ。すべて送る（`tracesSampleRate: 1`。
 *   2 人の利用なら無料枠の月 5M スパンの 1 割程度に収まる。`infra/sentry.tf`）。
 * - ログ: `console` に出したものすべて（`consoleLoggingIntegration`）。
 *
 * WHY NOT `--import` での起動（`@sentry/hono` の案内）: Vercel Function のエントリに置けない。それが要るのは
 * 依存パッケージを読み込み時に書き換える計測だけで、要求のスパンと fetch のスパンは Node 標準の
 * diagnostics_channel で取れる。DB は Neon の HTTP ドライバ（fetch）なので、書き換えは要らない。
 */
export function initSentry(): void {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.VERCEL_ENV,
    tracesSampleRate: 1,
    dataCollection: SENTRY_DATA_COLLECTION,
    integrations: [
      Sentry.captureConsoleIntegration({ levels: ['error'] }),
      Sentry.consoleLoggingIntegration(),
    ],
  });
  /**
   * Vercel Function は応答を返すと止まりうるので、送信が終わるまで `waitUntil` で生かしておく。
   * SDK が自分で待つのは Edge ランタイムだけで、Node ランタイムでは送りかけのまま止まる。
   * エラーは溜めずにすぐ送るので、送る直前（beforeEnvelope）に待ち始めれば、応答の後の処理で起きたエラーも
   * 取りこぼさない。溜めてから送るスパンとログは下の `flushAfterRequest` が送り出す。
   */
  Sentry.getClient()?.on('beforeEnvelope', () => {
    waitUntil(Sentry.flush(2000));
  });
}

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
 */
export function withSentry<E extends Env, S extends Schema, B extends string>(
  app: Hono<E, S, B>,
): Hono {
  const root = new Hono();
  root.use(Sentry.sentry(root, { shouldHandleError: () => false }));
  root.use(flushAfterRequest);
  root.route('/', app);
  return root;
}
