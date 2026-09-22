/**
 * つまんだ指をアプリの操作に使い切る間、タッチの既定の動きを取り上げる。
 * capture で先に受けて、縦スクロールにも横スワイプ（`SwipePager`）にも渡さない。
 * `signal` を abort するまで効く。掴んでいる間だけ足すので、普段のスクロールは
 * passive のまま（ブラウザが手を止めてこちらを待たない）。
 */
export function blockTouchMove(signal: AbortSignal) {
  document.addEventListener(
    'touchmove',
    (event) => {
      event.preventDefault();
      event.stopPropagation();
    },
    { capture: true, passive: false, signal },
  );
}
