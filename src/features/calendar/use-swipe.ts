import { type RefObject, useEffect, useRef } from 'react';

type Handlers = {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
};

const MIN_DISTANCE = 56;

/**
 * 要素上の横スワイプを検出する（タッチのみ）。縦スクロールと混ざらないよう、横の移動が縦の 2 倍を超えたときだけ反応する。
 * カレンダーで前後の月・週・日へ移るのに使う。
 *
 * 縦にスクロールする要素（タイムライン）の上では、ブラウザがスクロールを引き受けると touchend の代わりに
 * touchcancel が来るので、位置は touchmove で追いかけ、touchcancel でも判定する。要素側には
 * `touch-action: pan-y` を付け、横の動きをブラウザの「戻る」ジェスチャに取られないようにする。
 */
export function useSwipe(ref: RefObject<HTMLElement | null>, handlers: Handlers): void {
  // ハンドラは毎描画で作り直されるので ref に持ち、リスナーの付け直しは要素が変わったときだけにする
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let start: { x: number; y: number } | null = null;
    let last: { x: number; y: number } | null = null;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      start = t ? { x: t.clientX, y: t.clientY } : null;
      last = start;
    };
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || !start) return;
      last = { x: t.clientX, y: t.clientY };
      // 横の動きが主なら既定の動作（ブラウザの「戻る／進む」ジェスチャや横スクロール）を止める
      if (
        Math.abs(last.x - start.x) > 10 &&
        Math.abs(last.x - start.x) > Math.abs(last.y - start.y)
      ) {
        e.preventDefault();
      }
    };
    const onEnd = () => {
      if (!start || !last) return;
      const dx = last.x - start.x;
      const dy = last.y - start.y;
      start = null;
      last = null;
      if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 2) return;
      if (dx < 0) latest.current.onSwipeLeft();
      else latest.current.onSwipeRight();
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [ref]);
}
