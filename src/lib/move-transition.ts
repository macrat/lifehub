/**
 * 書き込みで一覧の中の項目の位置が変わるとき（タスクを完了にすると、完了した物の並びへ移る）に、
 * 項目が元の位置から新しい位置へ滑って見えるようにする View Transition の種別。
 * 瞬時に移ると、押した項目がどこへ行ったのか見失う。
 *
 * 名前（view-transition-name）がある要素どうしが前後で対になって動く。カレンダーの項目は表示の切り替えのために
 * いつも名前を持っている（`itemTransitionName`）。ホームのタイムラインの行は画面の移動では動かさないので
 * いつもは名前を持たず、この種別の遷移の間だけ `MOVE_TRANSITION_SX` で名前を持つ。
 */
const MOVE_TRANSITION_TYPE = 'move';

/**
 * この種別の遷移の間だけ要素に名前を付ける sx。名前は `match-element`（要素そのものが名前の代わり）なので、
 * 並べ替えで同じ DOM 要素が動く一覧（key の付いた行）なら、行ごとの名前を考えなくてよい。
 * 擬似クラスは html に付ける（`:root` のように `:` で始めると、Emotion が要素自身のクラスに繋げてしまう）。
 */
export const MOVE_TRANSITION_SX = {
  [`html:active-view-transition-type(${MOVE_TRANSITION_TYPE}) &`]: {
    viewTransitionName: 'match-element',
  },
} as const;

/**
 * update（キャッシュの書き換え）を、項目が動いて見える View Transition の中で行う。
 * 書き換えが画面に出るのは、TanStack Query が購読者への通知を `setTimeout(0)` で遅らせて送り、
 * それを受けた React が同じタスクの終わり（マイクロタスク）で描き直した後。書き換えの後に積んだ
 * `setTimeout(0)` は通知の後に回るので、それを待てば新しい画面が描き上がっている。
 * WHY NOT React の `<ViewTransition>`: React が遷移を起こすのは startTransition の更新だけで、
 * TanStack Query の更新（useSyncExternalStore）は対象にならない。
 */
export function withMoveTransition(update: () => void): void {
  document.startViewTransition({
    update: async () => {
      update();
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
    types: [MOVE_TRANSITION_TYPE],
  });
}
