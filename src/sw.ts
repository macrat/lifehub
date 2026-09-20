/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

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

/** サーバー（server/lib/push/send.ts）が送る本文 */
type PushMessage = { title: string; body: string; url: string; tag: string };

self.addEventListener('push', (event) => {
  if (!event.data) return;
  const message = event.data.json() as PushMessage;
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      tag: message.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: message.url },
    }),
  );
});

// タップで該当画面を開く。既に開いているタブがあればそれを使う。
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
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
