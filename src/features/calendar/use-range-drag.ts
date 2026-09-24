import { type PointerEvent, useEffect, useState } from 'react';
import { type GrabOptions, type RangeCallbacks, RangeDragSession } from './range-drag-session.ts';

export type DragHandlers = {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
};

type Options<P, G, R> = RangeCallbacks<P, G, R> & {
  /** 押したときに掴んだ物。空いている所なら null（省略すると、いつでも押した所から選び直す） */
  grabOf?: (event: PointerEvent<HTMLElement>) => G | null;
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
 *
 * ドラッグ 1 回の進み方は `RangeDragSession` が持ち、ここはそれを要素のハンドラと描画の寿命に繋ぐ。
 * 1 つのドラッグは 1 本の指だけのもので、別の指が触れたらそのドラッグは終わる
 * （時間軸ではそれがピンチの始まり。`use-pinch.ts`）。別の指がどこに降りるかは選べないので、
 * 掴んだ要素ではなく文書全体で見る。
 */
export function useRangeDrag<P, G, R>({ grabOf, ...cb }: Options<P, G, R>) {
  const [session] = useState(() => new RangeDragSession<P, G, R>());

  // 別の指が触れたら今のドラッグは終わり。出しっぱなしの 1 つで見るので、ドラッグごとの
  // 付け外しが要らず、「自分を足した pointerdown に自分が呼ばれる」ような際どさもない
  useEffect(() => {
    const controller = new AbortController();
    document.addEventListener('pointerdown', (event) => session.touch(event.pointerId), {
      signal: controller.signal,
    });
    return () => controller.abort();
  }, [session]);

  // 途中で消えても、長押しの待ちとタッチの取り上げを残さない
  useEffect(() => () => session.stop(), [session]);

  /** 押した所を読み、掴んだ物とつまみ方を添えてドラッグを始める。左ボタン以外・掴めない所では始めない */
  const down = (event: PointerEvent<HTMLElement>, grab: G | null, options: GrabOptions) => {
    if (event.button !== 0) return;
    const from = cb.locate(event);
    if (from !== null) session.start(event, grab, from, options, cb);
  };
  const handlers = {
    onPointerMove: (event: PointerEvent<HTMLElement>) => session.move(event, cb),
    onPointerUp: (event: PointerEvent<HTMLElement>) => session.up(event, cb),
    onPointerCancel: () => session.stop(),
  };

  return {
    /** グリッドのセル・列に渡す。項目の上で押したときは項目の操作を邪魔しない */
    props: {
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.target !== event.currentTarget) return;
        const grab = grabOf?.(event) ?? null;
        // 既に出ている枠をつまんだのなら長押しを待たない（枠は「今直している物」なので、そこに
        // 触れるのは直すときだけ）。空いている所からの選択だけは、タップや縦スクロール・
        // 横スワイプと分けるために待つ
        down(event, grab, { instant: grab !== null });
      },
      ...handlers,
    } satisfies DragHandlers,
    /**
     * 枠（端の丸、枠そのもの）や保存済みの予定の上に渡す。grab は `rangeOf` に渡る「何をつまんだか」で、
     * つまみ方（長押しを待つか、タップにも意味があるか）は `GrabOptions` で決める。
     */
    grabProps: (grab: G, options: GrabOptions = {}): DragHandlers => ({
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        down(event, grab, options);
      },
      ...handlers,
    }),
  };
}
