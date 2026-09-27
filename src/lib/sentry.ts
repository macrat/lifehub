import * as Sentry from '@sentry/react';

/**
 * ブラウザのエラーを Sentry に送る。DSN は本番のビルドにだけ埋め込まれる（`vite.config.ts`）ので、
 * ローカルと Preview では何もしない。
 *
 * 集めるのは未処理の例外と、React の描画中のエラー（下の `reportCaughtError`）。API のエラーは送らない:
 * サーバーのエラーはサーバーが送り（`server/lib/sentry.ts`）、通信の失敗はオフラインで使う PWA では不具合ではない。
 * 無料枠（`infra/sentry.tf`）に収めるため、トレースとセッションリプレイは有効にしない。
 */
export function initSentry(): void {
  if (!__SENTRY_DSN__) return;
  Sentry.init({
    dsn: __SENTRY_DSN__,
    release: __BUILD_COMMIT__,
    environment: 'production',
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
