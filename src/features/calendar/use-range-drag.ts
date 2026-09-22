import { type PointerEvent, useEffect, useRef } from 'react';
import { blockTouchMove } from '../../lib/ui/touch-block.ts';
// 長押しの区切りはアプリで 1 つ（一覧の行も同じ長さで編集に入る。`use-record-press.ts`）
import { LONG_PRESS_MS, LONG_PRESS_SLOP as SLOP } from '../../lib/ui/use-record-press.ts';

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

/** つまみ方。何をつまんだかによって、始め方とタップの意味が変わる */
type GrabOptions = {
  /** 長押しを待たずに始めるか（端の丸・枠のような、そこを押す以外の使い道が無い所） */
  instant?: boolean;
  /**
   * 動かさずに離したときも範囲を選ぶか。false は「タップ・クリックは押した要素に譲る」
   * （保存済みの予定をつまむときの、詳細を開くタップ）。
   */
  tap?: boolean;
};

/** ドラッグ 1 回の間だけ持つ値。範囲（`Drag`）に、追いかけるのに要るものを足したもの */
type DragState<P, G, R> = Drag<P, G> & {
  pointerId: number;
  origin: { x: number; y: number };
  /** 始まったか（タッチの長押しを待っている間は false） */
  active: boolean;
  /** 動かさずに離したときも選ぶか（`GrabOptions.tap`） */
  tap: boolean;
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
 * グリッドをなぞって範囲を選ぶ（Google カレンダーの予定の追加・編集）。
 * マウス・ペンは押した時点から、タッチは長押しから始める（タップや縦スクロール・横スワイプと分ける）。
 * 既に出ている枠をつまんだときは、タッチでも長押しを待たずに始める。
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
  const drag = useRef<DragState<P, G, R> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** なぞっている間タッチを取り上げている後始末（`blockTouchMove`）。掴んでいないときは null */
  const block = useRef<AbortController | null>(null);

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
    block.current?.abort();
    block.current = null;
    drag.current = null;
  };

  // 別の指が触れたら今のドラッグは終わり。出しっぱなしの 1 つで見るので、ドラッグごとの
  // 付け外しが要らず、「自分を足した pointerdown に自分が呼ばれる」ような際どさもない
  // biome-ignore lint/correctness/useExhaustiveDependencies: stop が見るのは ref だけで、どの描画でも同じ
  useEffect(() => {
    const controller = new AbortController();
    document.addEventListener(
      'pointerdown',
      (event) => {
        if (drag.current && event.pointerId !== drag.current.pointerId) stop();
      },
      { signal: controller.signal },
    );
    return () => controller.abort();
  }, []);

  // 途中で消えても、長押しの待ちとタッチの取り上げを残さない
  // biome-ignore lint/correctness/useExhaustiveDependencies: 同上
  useEffect(() => () => stop(), []);

  const start = (
    event: PointerEvent<HTMLElement>,
    grab: G | null,
    from: P,
    { instant = false, tap = true }: GrabOptions,
  ) => {
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
      tap,
      emitted: null,
    };
    const longPress = event.pointerType === 'touch' && !instant;
    const begin = () => {
      const d = drag.current;
      if (!d) return;
      d.active = true;
      // グリッドの外に出ても離すまで追いかける（隣の列や画面の外で見失わない）
      element.setPointerCapture(pointerId);
      // ここからのタッチは選択にだけ使う（縦スクロールと横スワイプに渡さない）。
      // 掴んだその場で取り上げる。描画を挟むと、その 1 枚ぶんだけ画面が流れてしまう
      block.current = new AbortController();
      blockTouchMove(block.current.signal);
      // 押しただけで知らせるのは、タップにも意味があるときか、長押しが決まったとき。
      // どちらでもない（マウスで予定をつまんだ）ときはまだクリックかもしれないので、動くまで待つ
      if (tap || longPress) emit(d, false);
    };
    if (longPress) timer.current = setTimeout(begin, LONG_PRESS_MS);
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
    // まだ何も知らせていない（クリックかもしれない）うちは、動いたとはっきりするまで待つ
    if (!d.emitted && !d.moved) return;
    const to = locate(event);
    if (to === null) return;
    d.to = to;
    emit(d, false);
  };

  const up = (event: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    if (d.active) {
      // 知らせたドラッグだけを締めくくる（クリックに終わったものは何も起こさない）
      if (d.emitted) {
        d.to = locate(event) ?? d.to;
        emit(d, true);
      }
    } else if (d.tap) {
      // 軽いタップ。日を選ぶ所（月表示のセル）ならそちらへ、それ以外は押した所を範囲にする。
      // タップを譲る約束（tap: false）で掴んだ物は何もしない（項目の click が詳細を開く）
      if (onTouchTap) onTouchTap(d.from);
      else emit(d, true);
    }
    stop();
  };

  return {
    /** グリッドのセル・列に渡す。項目の上で押したときは項目の操作を邪魔しない */
    props: {
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.button !== 0 || event.target !== event.currentTarget) return;
        const from = locate(event);
        if (from === null) return;
        const grab = grabOf?.(event) ?? null;
        // 既に出ている枠をつまんだのなら長押しを待たない（枠は「今直している物」なので、そこに
        // 触れるのは直すときだけ）。空いている所からの選択だけは、タップや縦スクロール・
        // 横スワイプと分けるために待つ
        start(event, grab, from, { instant: grab !== null });
      },
      onPointerMove: move,
      onPointerUp: up,
      onPointerCancel: stop,
    } satisfies DragHandlers,
    /**
     * 枠（端の丸、枠そのもの）や保存済みの予定の上に渡す。grab は `rangeOf` に渡る「何をつまんだか」で、
     * つまみ方（長押しを待つか、タップにも意味があるか）は `GrabOptions` で決める。
     */
    grabProps: (grab: G, options: GrabOptions = {}): DragHandlers => ({
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        const from = locate(event);
        if (from !== null) start(event, grab, from, options);
      },
      onPointerMove: move,
      onPointerUp: up,
      onPointerCancel: stop,
    }),
  };
}
