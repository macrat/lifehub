import { type RefObject, useEffect, useRef } from 'react';

type Handlers = {
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
};

const MIN_DISTANCE = 56;

/**
 * 要素上の縦のスワイプを検出する（タッチのみ）。クイック入力のシートを上へ広げ、下へ閉じるのに使う。
 * 横の動きと混ざらないよう、縦の移動が横の 2 倍を超えたときだけ反応する
 * （横スワイプでのページ送りはブラウザのスクロールスナップに任せている。`SwipePager`）。
 *
 * ブラウザがスクロールを引き受けると touchend の代わりに touchcancel が来るので、位置は touchmove で
 * 追いかけ、touchcancel でも判定する。
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
    /** 縦の移動量と、その向きを扱う相手がいるか */
    const gesture = () => {
      if (!start || !last) return null;
      const { onSwipeUp, onSwipeDown } = latest.current;
      const distance = last.y - start.y;
      return {
        distance,
        other: Math.abs(last.x - start.x),
        handler: distance < 0 ? onSwipeUp : onSwipeDown,
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
      // 自分で扱う向きに動いているなら、既定の動作（スクロールや引っぱって更新）を止める
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
