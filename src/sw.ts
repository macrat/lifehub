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
