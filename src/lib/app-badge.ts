/**
 * ホーム画面のアイコンに付く点。通知が届いた時点で Service Worker が付け（`src/sw.ts`）、
 * アプリを見た時点でここが消す。通知は「予定の直前に一度だけ」届くもので未読という状態を持たないので、
 * 数は出さず点だけにする（`setAppBadge()` を引数なしで呼ぶ）。
 *
 * 消すのは画面が見えているときだけ。裏で開いたままのタブが、見てもいない通知の点を消してしまわないようにする。
 */
export function watchAppBadge(): void {
  const clear = () => {
    if (document.visibilityState === 'visible') navigator.clearAppBadge?.();
  };
  clear();
  document.addEventListener('visibilitychange', clear);
}
