/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import type { PushMessage } from '../shared/push.ts';

declare const self: ServiceWorkerGlobalScope;

// アプリシェル（HTML/JS/CSS/アイコン）を precache し、2 回目以降はネットワークを待たずに起動する。
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA のナビゲーションは index.html にフォールバックする。API は対象外（レスポンスは SW でキャッシュしない）。
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//] }),
);

// 新版を検知したら次回起動で切り替える（autoUpdate）
self.skipWaiting();
clientsClaim();

self.addEventListener('push', (event) => {
  if (!event.data) return;
  const message = event.data.json() as PushMessage;
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(message.title, {
        body: message.body,
        tag: message.tag,
        // 読み上げと折り返しを日本語として扱わせる
        lang: 'ja',
        // 通知の中に出る絵。ここは元の色のまま出る
        icon: '/icons/icon-192.png',
        // ステータスバーに出る小さな印。Android は alpha だけを見て単色で塗るので、
        // 色付きの板を持つアプリアイコンを渡すと塗り潰れた四角になる。字だけの形を渡す
        badge: '/icons/badge-96.png',
        data: { url: message.url },
      }),
      // ホーム画面のアイコンにも点を付ける（アプリを見たら消える。src/lib/app-badge.ts）
      self.navigator.setAppBadge?.(),
    ]),
  );
});

// タップで該当画面を開く。既に開いているタブがあればそれを使う。
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  self.navigator.clearAppBadge?.();
  const url = new URL(
    (event.notification.data as { url?: string } | undefined)?.url ?? '/',
    self.location.origin,
  ).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const existing = clients.find((c) => 'focus' in c);
      if (existing) {
        await existing.focus();
        if ('navigate' in existing) await existing.navigate(url);
        return;
      }
      await self.clients.openWindow(url);
    }),
  );
});
