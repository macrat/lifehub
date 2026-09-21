import { type PointerEvent, useEffect, useRef, useState } from 'react';

/** タッチで範囲を選び始めるまでの長押し（ms）。タップや縦スクロールを選択と取り違えないための区切り */
const LONG_PRESS_MS = 300;
/** 長押しを待つ間に許す指のぶれと、タップとドラッグの境目（px） */
const SLOP = 8;

export type DragHandlers = {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
};

type Options<P, R> = {
  /** ポインタの位置 → 範囲の端。掴めない所なら null */
  locate: (event: PointerEvent<HTMLElement>) => P | null;
  /** 2 つの端 → 範囲。moved はドラッグしたか（タップ・クリックは false） */
  rangeOf: (anchor: P, current: P, moved: boolean) => R;
  /** 範囲が決まるたび。done はポインタを離した（入力に移ってよい）か */
  onChange: (range: R, done: boolean) => void;
  /** タッチの軽いタップ。省略するとタップでも範囲を選ぶ */
  onTouchTap?: (anchor: P) => void;
};

/**
 * グリッドをなぞって範囲を選ぶ（Google カレンダーの予定の追加）。
 * マウス・ペンは押した時点から、タッチは長押しから始める（タップや縦スクロール・横スワイプと分ける）。
 * 範囲は state に持たず onChange で呼び出し側（ページ）に渡す。状態を持つのはそちら 1 か所だけにする。
 */
export function useRangeDrag<P, R>({ locate, rangeOf, onChange, onTouchTap }: Options<P, R>) {
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    pointerId: number;
    anchor: P;
    origin: { x: number; y: number };
    moved: boolean;
    active: boolean;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    drag.current = null;
    setDragging(false);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  useEffect(() => {
    if (!dragging) return;
    // ドラッグ中のタッチは選択にだけ使う。capture で先に受けて、縦スクロールと横スワイプ（use-swipe）に渡さない
    const block = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('touchmove', block, { capture: true, passive: false });
    return () => document.removeEventListener('touchmove', block, { capture: true });
  }, [dragging]);

  /** 端をつまんだとき（handle）は長押しを待たず、最初から動かしたものとして扱う */
  const start = (event: PointerEvent<HTMLElement>, anchor: P, handle: boolean) => {
    const element = event.currentTarget;
    const { pointerId } = event;
    drag.current = {
      pointerId,
      anchor,
      origin: { x: event.clientX, y: event.clientY },
      moved: handle,
      active: false,
    };
    const begin = () => {
      const d = drag.current;
      if (!d) return;
      d.active = true;
      // グリッドの外に出ても離すまで追いかける（隣の列や画面の外で見失わない）
      element.setPointerCapture(pointerId);
      setDragging(true);
      onChange(rangeOf(d.anchor, d.anchor, d.moved), false);
    };
    if (event.pointerType === 'touch' && !handle) timer.current = setTimeout(begin, LONG_PRESS_MS);
    else begin();
  };

  const move = (event: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    const far =
      Math.abs(event.clientX - d.origin.x) > SLOP || Math.abs(event.clientY - d.origin.y) > SLOP;
    if (!d.active) {
      // 長押しを待つ間に動いたらスクロールのつもりとみなしてやめる
      if (far) stop();
      return;
    }
    if (far) d.moved = true;
    const current = locate(event);
    if (current !== null) onChange(rangeOf(d.anchor, current, d.moved), false);
  };

  const up = (event: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    if (d.active) onChange(rangeOf(d.anchor, locate(event) ?? d.anchor, d.moved), true);
    else if (onTouchTap) onTouchTap(d.anchor);
    else onChange(rangeOf(d.anchor, d.anchor, false), true);
    stop();
  };

  return {
    /** グリッドのセル・列に渡す。項目の上で押したときは項目の操作を邪魔しない */
    props: {
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.button !== 0 || event.target !== event.currentTarget) return;
        const anchor = locate(event);
        if (anchor !== null) start(event, anchor, false);
      },
      onPointerMove: move,
      onPointerUp: up,
      onPointerCancel: stop,
    } satisfies DragHandlers,
    /** 下書きの端（つまんで広げる丸）に渡す。anchor は動かさない方の端 */
    handleProps: (anchor: P): DragHandlers => ({
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        start(event, anchor, true);
      },
      onPointerMove: move,
      onPointerUp: up,
      onPointerCancel: stop,
    }),
  };
}
