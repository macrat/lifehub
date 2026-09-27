import * as Sentry from '@sentry/node';
import { waitUntil } from '@vercel/functions';
import { env } from './env.ts';

/**
 * サーバーのエラーを Sentry に送る。DSN（本番だけが持つ。`infra/vercel.tf`）が無ければ何もしない。
 * Vercel Function のエントリ（`api/index.ts`）が 1 度だけ呼ぶ。
 *
 * 送るのは `console.error` に出したものすべて（`captureConsoleIntegration`）。想定外のエラーは
 * 共通のエラーハンドラ（`server/app.ts`）、応答の後の処理（`after-response.ts`）、通知の予約と送信で
 * それぞれ `console.error` に出しているので、報告の呼び出しを個々に足さずに済み、足し忘れもない。
 * 業務エラー（404 や 409 など）は `console.error` に出さないので送られない。
 *
 * 無料枠（`infra/sentry.tf`）に収めるため、エラー以外（トレース・プロファイリング・ログ）は有効にしない。
 * WHY NOT `@sentry/hono`: Node 向けは `--import` での起動が前提で、Vercel Function のエントリには置けない。
 */
export function initSentry(): void {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.VERCEL_ENV,
    integrations: [Sentry.captureConsoleIntegration({ levels: ['error'] })],
    // 読み込み時に依存パッケージを書き換える仕組み。トレースのためのものなので要らない
    enableRuntimeChannelInjection: false,
  });
  /**
   * Vercel Function は応答を返すと止まりうるので、送信が終わるまで `waitUntil` で生かしておく。
   * SDK が自分で待つのは Edge ランタイムだけで、Node ランタイムでは送りかけのまま止まる。
   * 送る直前（beforeEnvelope）に待ち始めるので、応答の後の処理で起きたエラーも取りこぼさない。
   */
  Sentry.getClient()?.on('beforeEnvelope', () => {
    waitUntil(Sentry.flush(2000));
  });
}
