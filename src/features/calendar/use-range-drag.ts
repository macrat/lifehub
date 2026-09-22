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

/** ドラッグの今の姿。from は押した所、to は今の所（同じなら動いていない） */
export type Drag<P, G> = {
  /** つまんだ物（空いている所を押しただけなら null） */
  grab: G | null;
  from: P;
  to: P;
  /** ドラッグしたか（タップ・クリックと、つまんだだけで動かしていないときは false） */
  moved: boolean;
};

type Options<P, G, R> = {
  /** ポインタの位置 → グリッドの 1 点。掴めない所なら null */
  locate: (event: PointerEvent<HTMLElement>) => P | null;
  /** 押した所で掴んだ物。空いている所なら null（省略すると、いつでも押した所から選び直す） */
  grabOf?: (point: P) => G | null;
  /** ドラッグの姿 → 範囲 */
  rangeOf: (drag: Drag<P, G>) => R;
  /** 範囲が決まるたび。done はポインタを離した（入力に移ってよい）か */
  onChange: (range: R, done: boolean) => void;
  /** タッチの軽いタップ。省略するとタップでも範囲を選ぶ */
  onTouchTap?: (point: P) => void;
};

/**
 * グリッドをなぞって範囲を選ぶ（Google カレンダーの予定の追加）。
 * マウス・ペンは押した時点から、タッチは長押しから始める（タップや縦スクロール・横スワイプと分ける）。
 * 既にある範囲をつまんで直すときは「何をつまんだか」を渡し、意味づけは `rangeOf` に委ねる。
 * 渡し方は 2 通りで、範囲そのものがポインタを受けるなら `grabProps`、受けないなら（下の面で受けて
 * 押した位置から決めるなら）`grabOf`。範囲は state に持たず onChange で呼び出し側（ページ）に渡す。
 * 状態を持つのはそちら 1 か所だけにする。
 */
export function useRangeDrag<P, G, R>({
  locate,
  grabOf,
  rangeOf,
  onChange,
  onTouchTap,
}: Options<P, G, R>) {
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    pointerId: number;
    grab: G | null;
    from: P;
    to: P;
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
    // ドラッグ中のタッチは選択にだけ使う。capture で先に受けて、縦スクロールと横スワイプ（`SwipePager`）に渡さない
    const block = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('touchmove', block, { capture: true, passive: false });
    return () => document.removeEventListener('touchmove', block, { capture: true });
  }, [dragging]);

  /** instant は長押しを待たずに始めるか（端の丸のような、そこを押す以外の意味がない所） */
  const start = (event: PointerEvent<HTMLElement>, grab: G | null, from: P, instant: boolean) => {
    const element = event.currentTarget;
    const { pointerId } = event;
    drag.current = {
      pointerId,
      grab,
      from,
      to: from,
      origin: { x: event.clientX, y: event.clientY },
      moved: false,
      active: false,
    };
    const begin = () => {
      const d = drag.current;
      if (!d) return;
      d.active = true;
      // グリッドの外に出ても離すまで追いかける（隣の列や画面の外で見失わない）
      element.setPointerCapture(pointerId);
      setDragging(true);
      onChange(rangeOf(d), false);
    };
    if (event.pointerType === 'touch' && !instant) timer.current = setTimeout(begin, LONG_PRESS_MS);
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
    const to = locate(event);
    if (to === null) return;
    d.to = to;
    onChange(rangeOf(d), false);
  };

  const up = (event: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    if (d.active) {
      d.to = locate(event) ?? d.to;
      onChange(rangeOf(d), true);
    } else if (onTouchTap) onTouchTap(d.from);
    else onChange(rangeOf(d), true);
    stop();
  };

  return {
    /** グリッドのセル・列に渡す。項目の上で押したときは項目の操作を邪魔しない */
    props: {
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.button !== 0 || event.target !== event.currentTarget) return;
        const from = locate(event);
        if (from !== null) start(event, grabOf?.(from) ?? null, from, false);
      },
      onPointerMove: move,
      onPointerUp: up,
      onPointerCancel: stop,
    } satisfies DragHandlers,
    /** 下書きの上（端の丸、枠そのもの）に渡す。grab は `rangeOf` に渡る「何をつまんだか」 */
    grabProps: (grab: G, { instant = false } = {}): DragHandlers => ({
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        const from = locate(event);
        if (from !== null) start(event, grab, from, instant);
      },
      onPointerMove: move,
      onPointerUp: up,
      onPointerCancel: stop,
    }),
  };
}
