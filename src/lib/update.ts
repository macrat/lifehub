import { useTransition } from 'react';

/**
 * 最新版に入れ替えて起動し直す。
 *
 * インストールした PWA はアプリシェルを Service Worker の precache から起動するため、
 * 再読み込みだけでは版が変わらない（新版に切り替わるのは次の起動）。
 * そこで Service Worker を取りに行き直す。新版が見つかれば、それが有効になった時点で
 * registerSW（autoUpdate。`src/main.tsx`）が読み込み直すので、ここでは何もしない。
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

/** 読み込み直しを始めたか（`reloadApp`） */
let reloading = false;

/** 読み込み直しを始めた後か（ページごと捨てられるので、その間のエラーは見せも送りもしない） */
export function isReloading(): boolean {
  return reloading;
}

/**
 * ページを読み込み直す。アプリの読み込み直しはすべてここを通し、始めたことを `isReloading` で読めるようにする
 * （エラー画面を出さない `src/lib/ui/ErrorPage.tsx`、Sentry に送らない `src/lib/sentry.ts`）。
 */
export function reloadApp(): void {
  reloading = true;
  location.reload();
}

/** 古い版のコードを読めずに読み込み直した時刻（sessionStorage のキー） */
const STALE_CHUNK_RELOADED_AT = 'lifehub-stale-chunk-reloaded-at';

/** 読み込み直しても同じ失敗が続くときに、読み込み直しを繰り返さない間隔 */
const STALE_CHUNK_RELOAD_INTERVAL_MS = 10_000;

/**
 * 画面のコードを読めなかったら（`vite:preloadError`）、読み込み直して新版で起動し直す。
 * 仕組みと理由は docs/architecture.md の「PWA」。
 */
export function reloadOnStaleChunk(): void {
  window.addEventListener('vite:preloadError', () => {
    const now = Date.now();
    const reloadedAt = Number(sessionStorage.getItem(STALE_CHUNK_RELOADED_AT));
    if (now - reloadedAt < STALE_CHUNK_RELOAD_INTERVAL_MS) return;
    sessionStorage.setItem(STALE_CHUNK_RELOADED_AT, String(now));
    reloadApp();
  });
}

/** 更新ボタン。取りに行っている間は `updating` が立つ（押しても暫く画面が変わらないため） */
export function useUpdateApp(): { updating: boolean; update: () => void } {
  const [updating, startUpdate] = useTransition();
  return { updating, update: () => startUpdate(updateApp) };
}
