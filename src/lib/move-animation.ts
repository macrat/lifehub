import { notifyManager } from '@tanstack/react-query';

/**
 * 書き込みの結果を先に出したとき・送信に失敗して戻したとき（`useOptimisticMutation`）に、位置の変わった
 * 行を元の位置から新しい位置へ滑らせる（タスクを完了にすると完了した物の並びへ移る、日付を直すと別の日の下へ移る）。
 * 瞬時に移ると、押した行がどこへ行ったのか見失う。取り直しの結果で変わるときは動かさない
 * （利用者が起こした変化ではないので、追う必要が無い）。
 *
 * 書き換えの前後で同じキー（`moveKey`）を持つ要素の位置を比べ、ずれた分だけ元の位置へ戻した所から
 * 動かす（FLIP）。行が別の日付の下へ移って作り直されても、キーが同じなら同じ行として動く。
 * WHY NOT View Transition: 遷移の間（既定で 0.25 秒）は画面が撮った絵に置き換わり、タップがすべて
 * 文書の根に届いて失われる。タスクを続けて完了にしたり、保存してすぐ別の日を押したりすると、押したことが消える。
 * 動かすのは本物の要素なので、動いている間も押せる。
 */

const MOVE_KEY_ATTRIBUTE = 'data-move-key';

/** 動かすときの時間と緩急（View Transition の既定に揃える。画面の移動と同じ速さで動く） */
const MOVE_TIMING = { duration: 250, easing: 'ease' } as const;

/**
 * 書き込みで動かしたい要素に付ける属性。キーは画面の中で一意にする（同じキーが 2 つあると、どちらか一方しか動かない）。
 * undefined なら何も付けない（動かさない）。
 */
export function moveKeyAttribute(key: string | undefined): { [MOVE_KEY_ATTRIBUTE]?: string } {
  return key === undefined ? {} : { [MOVE_KEY_ATTRIBUTE]: key };
}

/** キーを持つ要素の、画面の中の位置 */
function positions(): Map<string, { element: Element; rect: DOMRect }> {
  const found = new Map<string, { element: Element; rect: DOMRect }>();
  for (const element of document.querySelectorAll(`[${MOVE_KEY_ATTRIBUTE}]`)) {
    const key = element.getAttribute(MOVE_KEY_ATTRIBUTE);
    if (key !== null) found.set(key, { element, rect: element.getBoundingClientRect() });
  }
  return found;
}

/** 画面とその上下 1 画面分に掛かっているか。その外は見えないので動かさない */
function nearViewport(rect: DOMRect): boolean {
  return rect.bottom > -innerHeight && rect.top < 2 * innerHeight;
}

/**
 * update（キャッシュの書き換え）を行い、位置の変わった要素を元の位置から動かす。
 * 書き換えが画面に出るのは、TanStack Query が遅らせて送る通知（`notifyManager`）を受けて React が描き直した後。
 * 書き換えと同じ batch の中で積んだ処理は通知と同じタスクの最後に呼ばれ、React の描き直し（そのタスクの
 * マイクロタスク）の後に続きが走るので、新しい位置を測って動かし始めるまでに画面が描かれることは無い
 * （新しい位置のまま一瞬映ってから戻る、ということが起きない）。
 */
export async function withMoveAnimation(update: () => void): Promise<void> {
  const before = positions();
  await new Promise<void>((resolve) =>
    notifyManager.batch(() => {
      update();
      notifyManager.schedule(resolve);
    }),
  );
  for (const [key, { element, rect }] of positions()) {
    const from = before.get(key)?.rect;
    if (!from || !(nearViewport(from) || nearViewport(rect))) continue;
    const dx = from.left - rect.left;
    const dy = from.top - rect.top;
    if (dx === 0 && dy === 0) continue;
    element.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
      MOVE_TIMING,
    );
  }
}
