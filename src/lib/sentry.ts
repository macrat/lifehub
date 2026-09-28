import * as Sentry from '@sentry/react';
import type { AnyRouter } from '@tanstack/react-router';
import { SENTRY_DATA_COLLECTION } from '../../shared/sentry.ts';

/**
 * ブラウザのエラー・トレース・ログを Sentry に送る。DSN は本番のビルドにだけ埋め込まれる（`vite.config.ts`）ので、
 * ローカルと Preview では何もしない。
 *
 * - エラー: 未処理の例外と、React の描画中のエラー（下の `reportCaughtError`）。API のエラーは送らない:
 *   サーバーのエラーはサーバーが送り（`server/lib/sentry.ts`）、通信の失敗はオフラインで使う PWA では不具合ではない。
 * - トレース: 起動と画面の移動（ルート名で。`tanstackRouterBrowserTracingIntegration`）と、その間の API への
 *   要求。API への要求にはトレースの見出しを付け、サーバーのスパンと 1 本のトレースに繋ぐ（同じオリジンなので既定で付く）。
 *   すべて送る（`tracesSampleRate: 1`。2 人の利用なら無料枠に収まる。`infra/sentry.tf`）。
 * - ログ: `console` に出したものすべて（`consoleLoggingIntegration`）。
 *
 * セッションリプレイは無料枠が月 50 件しかないので使わない。
 */
export function initSentry(router: AnyRouter): void {
  if (!__SENTRY_DSN__) return;
  Sentry.init({
    dsn: __SENTRY_DSN__,
    release: __BUILD_COMMIT__,
    environment: 'production',
    tracesSampleRate: 1,
    dataCollection: SENTRY_DATA_COLLECTION,
    integrations: [
      Sentry.tanstackRouterBrowserTracingIntegration(router),
      Sentry.consoleLoggingIntegration(),
    ],
  });
}

/**
 * `createRoot` の `onCaughtError`。ルートのエラー画面（`ErrorPage`）が受け止めたエラーは window まで
 * 上がってこないので、React から直接受け取って送る。既定と同じくコンソールにも出す（渡すと React 自身は出さない）。
 * 受け止められなかったエラーは React の既定が `reportError` で window へ上げ、SDK がそこで拾う。
 */
export const reportCaughtError = Sentry.reactErrorHandler((error, { componentStack }) => {
  console.error(error, componentStack);
});
