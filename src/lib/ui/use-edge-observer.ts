import { type RefObject, useEffect, useEffectEvent } from 'react';
import type { PullEdge } from './use-pull-to-refresh.ts';

/** 端がこの距離まで近づいたら続きを読む（見えてから読み始めると、読み終わるまで空白が見える） */
const PRELOAD_MARGIN = '400px 0px';

/**
 * 続きを読む物。null はこの端で読み足す一覧だが、今は読む物が無い（読み込み中・読み切った）とき。
 * undefined（渡さない）はこの端では読み足さない一覧
 */
export type EdgeLoader = (() => void) | null;

/**
 * 一覧の端の見張り（`InfiniteScroll`、ホームのタイムライン）。読む物がある（onReach が関数の）間だけ見張る。
 * 見張り始めるとその時点で見えているかを知らせてくるので、読み終わって読む物が戻るたびに端がまだ見えていれば、
 * 続けて次を読む。読み込み中は onReach を null にすることで、二重に読まない。
 *
 * この端で読み足す一覧なら（onReach が undefined でなければ）、読む物が無い間も含めて見張りの要素にその端の印
 * （`data-loads-at`）を付ける。引っ張って更新はこの印を読み、読み足す端からは引かせない（`usePullToRefresh`）。
 * 印を見張りそのものに持たせるので、無限スクロールの一覧を作れば必ず印が付き、付け忘れられない。
 */
export function useEdgeObserver(
  ref: RefObject<HTMLElement | null>,
  edge: PullEdge,
  onReach: EdgeLoader | undefined,
) {
  const reach = useEffectEvent(() => onReach?.());
  const loads = onReach !== undefined;
  const enabled = typeof onReach === 'function';
  useEffect(() => {
    const el = ref.current;
    if (!loads || !el) return;
    el.dataset.loadsAt = edge;
    return () => {
      delete el.dataset.loadsAt;
    };
  }, [ref, edge, loads]);
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) reach();
      },
      { rootMargin: PRELOAD_MARGIN },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, enabled]);
}
