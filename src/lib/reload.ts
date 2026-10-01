/** 読み込み直しを始めたか */
let reloading = false;

/** 読み込み直しを始めた後か */
export function isReloading(): boolean {
  return reloading;
}

/**
 * ページを読み込み直す。アプリの読み込み直しはすべてここを通す（`lint/reload.grit`）。
 * 始めた後の扱いは docs/architecture.md の「PWA」。
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
