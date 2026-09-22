import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { blockTouchMove } from './touch-block.ts';

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

/** ドラッグ 1 回の間だけ持つ値。範囲（`Drag`）に、追いかけるのに要るものを足したもの */
type DragState<P, G, R> = Drag<P, G> & {
  pointerId: number;
  origin: { x: number; y: number };
  /** 始まったか（タッチの長押しを待っている間は false） */
  active: boolean;
  /** 直前に渡した範囲。手応えのために 1 つ前と比べる（ドラッグごとに作り直すので持ち越さない） */
  emitted: { range: R } | null;
};

type Options<P, G, R> = {
  /** ポインタの位置 → グリッドの 1 点。掴めない所なら null */
  locate: (event: PointerEvent<HTMLElement>) => P | null;
  /** 押したときに掴んだ物。空いている所なら null（省略すると、いつでも押した所から選び直す） */
  grabOf?: (event: PointerEvent<HTMLElement>) => G | null;
  /** ドラッグの姿 → 範囲 */
  rangeOf: (drag: Drag<P, G>) => R;
  /** 範囲が決まるたび。done はポインタを離した（入力に移ってよい）か */
  onChange: (range: R, done: boolean) => void;
  /** 範囲が変わったときの手応えの長さ（ms）。震わせないなら null。何が区切りかは呼び出し側が決める */
  vibration?: (previous: R, next: R) => number | null;
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
 * 範囲が変わるたび `vibration` の長さで震わせ、指が今どこを選んでいるかを手に返す。
 * 1 つのドラッグは 1 本の指だけのもので、別の指が触れたらそのドラッグは終わる
 * （時間軸ではそれがピンチの始まり。`use-pinch.ts`）。別の指がどこに降りるかは選べないので、
 * 掴んだ要素ではなく文書全体で見る。
 */
export function useRangeDrag<P, G, R>({
  locate,
  grabOf,
  rangeOf,
  onChange,
  vibration,
  onTouchTap,
}: Options<P, G, R>) {
  const [dragging, setDragging] = useState(false);
  const drag = useRef<DragState<P, G, R> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * 範囲を呼び出し側に渡す。1 つ前の範囲から変わっていれば、その長さだけ震わせる。
   * ドラッグの最初の 1 回は比べる相手が無いので震わせない（押しただけで手応えを返さない）。
   */
  const emit = (d: DragState<P, G, R>, done: boolean) => {
    const range = rangeOf(d);
    const ms = d.emitted ? vibration?.(d.emitted.range, range) : null;
    // Vibration API の無いブラウザ（iOS）では何も起こらない
    if (ms) navigator.vibrate?.(ms);
    d.emitted = { range };
    onChange(range, done);
  };

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    drag.current = null;
    setDragging(false);
  };

  // 別の指が触れたら今のドラッグは終わり。出しっぱなしの 1 つで見るので、ドラッグごとの
  // 付け外しが要らず、「自分を足した pointerdown に自分が呼ばれる」ような際どさもない
  // biome-ignore lint/correctness/useExhaustiveDependencies: stop が見るのは ref と setState だけで、どの描画でも同じ
  useEffect(() => {
    const controller = new AbortController();
    document.addEventListener(
      'pointerdown',
      (event) => {
        if (drag.current && event.pointerId !== drag.current.pointerId) stop();
      },
      { signal: controller.signal },
    );
    return () => {
      controller.abort();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // ドラッグ中のタッチは選択にだけ使う（縦スクロールと横スワイプに渡さない）
  useEffect(() => {
    if (!dragging) return;
    const controller = new AbortController();
    blockTouchMove(controller.signal);
    return () => controller.abort();
  }, [dragging]);

  /** instant は長押しを待たずに始めるか（端の丸のような、そこを押す以外の意味がない所） */
  const start = (event: PointerEvent<HTMLElement>, grab: G | null, from: P, instant: boolean) => {
    // 2 本目の指なら、今のドラッグごとやめて新しくは始めない（ピンチに譲る）
    if (drag.current) return stop();
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
      emitted: null,
    };
    const begin = () => {
      const d = drag.current;
      if (!d) return;
      d.active = true;
      // グリッドの外に出ても離すまで追いかける（隣の列や画面の外で見失わない）
      element.setPointerCapture(pointerId);
      setDragging(true);
      emit(d, false);
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
    emit(d, false);
  };

  const up = (event: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    if (d.active) {
      d.to = locate(event) ?? d.to;
      emit(d, true);
    } else if (onTouchTap) onTouchTap(d.from);
    else emit(d, true);
    stop();
  };

  return {
    /** グリッドのセル・列に渡す。項目の上で押したときは項目の操作を邪魔しない */
    props: {
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.button !== 0 || event.target !== event.currentTarget) return;
        const from = locate(event);
        if (from !== null) start(event, grabOf?.(event) ?? null, from, false);
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
