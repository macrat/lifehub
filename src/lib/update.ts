import { useTransition } from 'react';
import { reloadApp } from './reload.ts';

/**
 * 最新版に入れ替えて起動し直す。
 *
 * インストールした PWA はアプリシェルを Service Worker の precache から起動するため、
 * 再読み込みだけでは版が変わらない。そこで Service Worker を取りに行き直す。新版が見つかれば、
 * それが有効になった時点で registerSW（autoUpdate。`src/main.tsx`）が読み込み直すので、ここでは何もしない。
 *
 * 登録の取得に `navigator.serviceWorker.ready` を使わないのは、Service Worker を登録しない
 * 開発サーバー（`vite.config.ts` の `devOptions`）では永久に解決しないため。
 */
async function updateApp(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.update();
    if (registration?.installing ?? registration?.waiting) return;
  } catch {
    // 取りに行けなくても（オフライン、Service Worker が無い開発サーバー）読み込み直す。
    // 「押したのに何も起きない」を作らないため、ここで止めない。
  }
  // 新版が無ければ、ただの再読み込みで終わる。
  reloadApp();
}

/** 更新ボタン。取りに行っている間は `updating` が立つ（押しても暫く画面が変わらないため） */
export function useUpdateApp(): { updating: boolean; update: () => void } {
  const [updating, startUpdate] = useTransition();
  return { updating, update: () => startUpdate(updateApp) };
}
