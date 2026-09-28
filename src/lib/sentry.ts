import * as Sentry from '@sentry/react';
import { type QueryClient, QueryObserver } from '@tanstack/react-query';
import type { AnyRouter } from '@tanstack/react-router';
import { SENTRY_DATA_COLLECTION, sentryUser } from '../../shared/sentry.ts';
import { meQueryOptions } from './auth.ts';

/**
 * ブラウザのエラー・トレース・ログを Sentry に送る。DSN は本番のビルドにだけ埋め込まれる（`vite.config.ts`）ので、
 * ローカルと Preview では何もしない。
 *
 * - エラー: 未処理の例外と、React の描画中のエラー（下の `reportCaughtError`）。API のエラーは送らない:
 *   サーバーのエラーはサーバーが送り（`server/lib/sentry.ts`）、通信の失敗はオフラインで使う PWA では不具合ではない。
 * - トレース: 起動と画面の移動（ルート名で。`tanstackRouterBrowserTracingIntegration`）と、その間の API への
 *   要求。API への要求にはトレースの見出しを付け、サーバーのスパンと 1 本のトレースに繋ぐ（同じオリジンなので既定で付く）。
 *   すべて送る（`tracesSampleRate: 1`。無料枠に収まる見積もりは docs/architecture.md の「監視（Sentry）」）。
 * - ログ: `console` に出したものすべて（`consoleLoggingIntegration`）。
 *
 * セッションリプレイは無料枠が月 50 件しかないので使わない。
 */
export function initSentry(router: AnyRouter, client: QueryClient): void {
  const dsn = import.meta.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    release: __BUILD_COMMIT__,
    environment: 'production',
    tracesSampleRate: 1,
    dataCollection: SENTRY_DATA_COLLECTION,
    integrations: [
      Sentry.tanstackRouterBrowserTracingIntegration(router),
      Sentry.consoleLoggingIntegration(),
    ],
    /**
     * View Transition の途中で次の遷移が始まったときの AbortError（前の遷移のアニメーションが飛ばされただけで、
     * 画面の更新は行われる）。ルーター（`defaultViewTransition`）は `startViewTransition` の `updateCallbackDone`
     * だけを待ち、`ready` を放っておくので、その reject が未処理の例外として上がってくる。
     * 不具合は @tanstack/router-core（`RouterCore` の `startViewTransition`）にあり、上流で直るまでの間だけ送らない。
     * 直った版に上げたら消す。
     * WHY NOT アプリ側で直す: 依存ライブラリへのパッチも `router.startViewTransition` の差し替えも、ライブラリの
     * 内側に手を入れることになり、更新のたびに追従が要る。
     * 文字列で絞るので、名前の重複で遷移が行われない InvalidStateError（`item-transition.ts`）は引き続き送られる
     */
    ignoreErrors: ['Transition was skipped. New ViewTransition started'],
  });
  watchUser(client);
}

/**
 * ログイン中のユーザーを Sentry に知らせ続ける（`sentryUser`。サーバーの `setSentryUser` と同じ値）。
 * ログイン中のユーザーの置き場所（`meQueryOptions` のキャッシュ）を読むだけの observer で見張るので、ログイン・
 * ログアウト・セッション切れ・永続化キャッシュからの復元のどれで変わっても、呼び出し側に手を入れずに追従する。
 */
function watchUser(client: QueryClient): void {
  const observer = new QueryObserver(client, { ...meQueryOptions, enabled: false });
  let current: string | null = null;
  const sync = (id: string | null) => {
    if (id === current) return;
    current = id;
    Sentry.setUser(sentryUser(id));
  };
  observer.subscribe(({ data }) => sync(data?.id ?? null));
  sync(observer.getCurrentResult().data?.id ?? null);
}

/**
 * `createRoot` の `onCaughtError`。ルートのエラー画面（`ErrorPage`）が受け止めたエラーは window まで
 * 上がってこないので、React から直接受け取って送る。既定と同じくコンソールにも出す（渡すと React 自身は出さない）。
 * 受け止められなかったエラーは React の既定が `reportError` で window へ上げ、SDK がそこで拾う。
 */
export const reportCaughtError = Sentry.reactErrorHandler((error, { componentStack }) => {
  console.error(error, componentStack);
});
