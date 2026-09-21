import { type RefObject, useEffect, useRef } from 'react';

type Handlers = {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
};

const MIN_DISTANCE = 56;

/**
 * 要素上のスワイプを検出する（タッチのみ）。縦と横が混ざらないよう、主な向きの移動がもう一方の
 * 2 倍を超えたときだけ反応する。カレンダーの前後の月・週・日への移動（横）と、クイック入力の
 * シートの開閉（縦）に使う。
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
    /** 主な向きの移動量と、扱う相手がいるか */
    const gesture = () => {
      if (!start || !last) return null;
      const dx = last.x - start.x;
      const dy = last.y - start.y;
      const horizontal = Math.abs(dx) > Math.abs(dy);
      const { onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown } = latest.current;
      return {
        distance: horizontal ? dx : dy,
        other: Math.abs(horizontal ? dy : dx),
        handler: horizontal
          ? dx < 0
            ? onSwipeLeft
            : onSwipeRight
          : dy < 0
            ? onSwipeUp
            : onSwipeDown,
      };
    };
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      start = t ? { x: t.clientX, y: t.clientY } : null;
      last = start;
    };
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || !start) return;
      last = { x: t.clientX, y: t.clientY };
      // 自分で扱う向きに動いているなら、既定の動作（ブラウザの「戻る」ジェスチャやスクロール）を止める
      const g = gesture();
      if (g?.handler && Math.abs(g.distance) > 10 && Math.abs(g.distance) > g.other) {
        e.preventDefault();
      }
    };
    const onEnd = () => {
      const g = gesture();
      start = null;
      last = null;
      if (!g || Math.abs(g.distance) < MIN_DISTANCE || Math.abs(g.distance) < g.other * 2) return;
      g.handler?.();
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
