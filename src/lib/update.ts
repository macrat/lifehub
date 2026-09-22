/**
 * 最新版に入れ替えて起動し直す。
 *
 * インストールした PWA はアプリシェルを Service Worker の precache から起動するため、
 * 再読み込みだけでは版が変わらない（新版の取得は次の起動を待つ）。
 * そこで Service Worker を取り直し、新版が有効になってから読み込み直す。
 */
export async function updateApp(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.update();
    const pending = registration?.installing ?? registration?.waiting;
    if (pending) await whenSettled(pending);
  } catch {
    // 取りに行けなくても（オフライン、Service Worker が無い開発サーバー）読み込み直す。
    // 「押したのに何も起きない」を作らないため、ここで止めない。
  }
  location.reload();
}

/**
 * Service Worker が有効（または破棄）になるまで待つ。
 * 有効になった時点から次の読み込みを新版が処理する（`src/sw.ts` の `skipWaiting`）。
 */
function whenSettled(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (worker.state === 'activated' || worker.state === 'redundant') resolve();
    };
    worker.addEventListener('statechange', check);
    // 待ち始めるまでに済んでいることがある
    check();
  });
}
