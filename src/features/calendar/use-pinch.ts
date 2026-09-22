import { type PointerEvent, useEffect, useRef } from 'react';

type Point = { x: number; y: number };

const gapOf = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const preventDefault = (event: Event) => event.preventDefault();

/**
 * 2 本の指でつまんで拡げ縮めする（ピンチ）。指の間隔が変わるたび、直前からの倍率を渡す。
 * 追いかけるのは Pointer Events（Safari の `gesturechange` は標準ではなく、ブラウザの拡大に紐づいている）。
 * 倍率は始めた時点ではなく直前からの比なので、受け取る側は上限・下限で止めるだけでよい
 * （始点からの比だと、止まったあとも比が伸び続けて戻すときに効かない時間ができる）。
 * 3 本目の指が触れている間は間隔を測らない（どの 2 本の間隔とも決められないため）。
 *
 * 2 本とも離すまで自分でポインタを受け取り（`setPointerCapture`）、触れている間はタッチの既定の
 * 動きを止める。2 本指はブラウザにとってスクロールなので、止めないと拡げ縮めと同時に画面が流れる。
 * 捕まえるのはつまみ始めてからなので、1 本だけのスクロール・なぞりはそのまま通る。
 */
export function usePinch(onZoom: (ratio: number) => void) {
  const points = useRef(new Map<number, Point>());
  const gap = useRef(0);
  const block = useRef<AbortController | null>(null);

  /** 触れている 2 本の指の間隔。2 本ちょうどでなければ 0（測れない、の意味） */
  const measure = () => {
    const [a, b] = [...points.current.values()];
    return points.current.size === 2 && a && b ? gapOf(a, b) : 0;
  };

  const end = (event: PointerEvent<HTMLElement>) => {
    if (!points.current.delete(event.pointerId)) return;
    gap.current = measure();
    if (points.current.size >= 2) return;
    block.current?.abort();
    block.current = null;
  };

  useEffect(() => () => block.current?.abort(), []);

  // capture: 内側の部品（下書きの枠）がポインタを止めていても、2 本目の指を取りこぼさない
  return {
    onPointerDownCapture: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'touch') return;
      points.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      gap.current = measure();
      if (points.current.size !== 2 || block.current) return;
      for (const id of points.current.keys()) event.currentTarget.setPointerCapture(id);
      block.current = new AbortController();
      document.addEventListener('touchmove', preventDefault, {
        capture: true,
        passive: false,
        signal: block.current.signal,
      });
    },
    onPointerMoveCapture: (event: PointerEvent<HTMLElement>) => {
      if (!points.current.has(event.pointerId)) return;
      points.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const next = measure();
      if (gap.current > 0 && next > 0) onZoom(next / gap.current);
      gap.current = next;
    },
    onPointerUpCapture: end,
    onPointerCancelCapture: end,
  };
}
