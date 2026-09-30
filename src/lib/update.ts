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
  location.reload();
}

/** 読み込み直しを始めたか（`reloadOnStaleChunk`） */
let reloading = false;

/**
 * 読み込み直しを始めた後か。この間に起きたエラーはページごと捨てられ、利用者には届かないので、
 * Sentry に送らない（`src/lib/sentry.ts`）。
 */
export function isReloading(): boolean {
  return reloading;
}

/** 古い版のコードを読めずに読み込み直した時刻（sessionStorage のキー） */
const STALE_CHUNK_RELOADED_AT = 'lifehub:stale-chunk-reloaded-at';

/** 読み込み直しても同じ失敗が続くときに、読み込み直しを繰り返さない間隔 */
const STALE_CHUNK_RELOAD_INTERVAL_MS = 10_000;

/**
 * 画面のコードを読めなかったら（`vite:preloadError`）、読み込み直して新版で起動し直す。
 *
 * 新版をデプロイすると旧版のファイルはサーバーから消え、新版の Service Worker も旧版の precache を消す。
 * そのため、旧版のページがまだ読み込んでいない画面のコードを取りに行くと失敗する
 * （Failed to fetch dynamically imported module）。読み込み直せば新版のファイルで開き直せる。
 *
 * 読み込み直しても同じ失敗が続く（オフラインで precache にも無いなど）ときは、読み込み直しを繰り返さず、
 * エラー画面を出して Sentry に送る。回数ではなく間隔で止めるのは、同じタブを開いたまま次のデプロイを
 * 迎えたときに、また読み込み直せるようにするため。
 *
 * WHY NOT TanStack Router の `lazyRouteComponent` の読み込み直しに任せる: あちらも読み込み直すが、
 * ページが離れるまでの間に描き直されるとエラーを投げ、エラー画面が一瞬出て Sentry にも送られる。
 * 読み込み直しを始めたことをここで持ち、その間のエラーを送らない（`isReloading`）。
 */
export function reloadOnStaleChunk(): void {
  window.addEventListener('vite:preloadError', () => {
    if (reloading) return;
    const reloadedAt = Number(sessionStorage.getItem(STALE_CHUNK_RELOADED_AT));
    if (Date.now() - reloadedAt < STALE_CHUNK_RELOAD_INTERVAL_MS) return;
    sessionStorage.setItem(STALE_CHUNK_RELOADED_AT, String(Date.now()));
    reloading = true;
    location.reload();
  });
}

/** 更新ボタン。取りに行っている間は `updating` が立つ（押しても暫く画面が変わらないため） */
export function useUpdateApp(): { updating: boolean; update: () => void } {
  const [updating, startUpdate] = useTransition();
  return { updating, update: () => startUpdate(updateApp) };
}
