import { type RefObject, useEffect, useRef } from 'react';

type Handlers = {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
};

const MIN_DISTANCE = 56;

/**
 * 要素上の横スワイプを検出する（タッチのみ）。縦スクロールと混ざらないよう、横の移動が縦の 2 倍を超えたときだけ反応する。
 * カレンダーで前後の月・週・日へ移るのに使う。
 */
export function useSwipe(ref: RefObject<HTMLElement | null>, handlers: Handlers): void {
  // ハンドラは毎描画で作り直されるので ref に持ち、リスナーの付け直しは要素が変わったときだけにする
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let start: { x: number; y: number } | null = null;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      start = t ? { x: t.clientX, y: t.clientY } : null;
    };
    const onEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (!start || !t) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      start = null;
      if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 2) return;
      if (dx < 0) latest.current.onSwipeLeft();
      else latest.current.onSwipeRight();
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchend', onEnd);
    };
  }, [ref]);
}
