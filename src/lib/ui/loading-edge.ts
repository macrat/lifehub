/**
 * 無限スクロールの一覧が続きを読み足す端。一覧の端の見張り（`EdgeSentinel`）が印を付け、
 * 引っ張って更新（`usePullToRefresh`）がそれを読んで、読み足す端からは引かせない。
 */

/** 続きを読む物。null は、この端で読み足す一覧だが今は読む物が無い（読み込み中・読み切った）とき */
export type EdgeLoader = (() => void) | null;

/** 見張りが自分に付ける、読み足す端の印（'top' | 'bottom'） */
export const LOADS_AT_ATTRIBUTE = 'data-loads-at';

/** 範囲の中の無限スクロールの一覧が続きを読み足す端 */
export function loadingEdges(area: Element): Set<string | null> {
  return new Set(
    [...area.querySelectorAll(`[${LOADS_AT_ATTRIBUTE}]`)].map((el) =>
      el.getAttribute(LOADS_AT_ATTRIBUTE),
    ),
  );
}
