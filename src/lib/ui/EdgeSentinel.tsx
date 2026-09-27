import { useEffect, useEffectEvent, useRef } from 'react';
import { type EdgeLoader, LOADS_AT_ATTRIBUTE } from './loading-edge.ts';
import type { PullEdge } from './use-pull-to-refresh.ts';

/** 端がこの距離まで近づいたら続きを読む（見えてから読み始めると、読み終わるまで空白が見える） */
const PRELOAD_MARGIN = '400px 0px';

/**
 * 無限スクロールの一覧の端に置く見張り（`InfiniteScroll`、ホームのタイムライン）。読む物がある（onReach が関数の）
 * 間だけ見張る。見張り始めるとその時点で見えているかを知らせてくるので、読み終わって読む物が戻るたびに端がまだ
 * 見えていれば、続けて次を読む。読み込み中は onReach を null にすることで、二重に読まない。
 *
 * 見張りには見張る端の印（`data-loads-at`）を付け、引っ張って更新はこの印を読んで、続きを読み足す端からは
 * 引かせない（`loadingEdges`、`usePullToRefresh`）。
 * - 印を見張りそのものに持たせるので、無限スクロールの一覧を作れば必ず印が付き、付け忘れられない
 * - 読み足さない端には見張りを置かない（onReach に undefined を渡す口は無い）ので、読み足す端と印が食い違わない
 * - 読み込み中・読み切った後も（onReach が null でも）見張りと印は残り、引ける端が読み込みのたびに変わらない
 */
export function EdgeSentinel({ edge, onReach }: { edge: PullEdge; onReach: EdgeLoader }) {
  const ref = useRef<HTMLDivElement>(null);
  const reach = useEffectEvent(() => onReach?.());
  const enabled = onReach !== null;
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
  }, [enabled]);
  return <div ref={ref} {...{ [LOADS_AT_ATTRIBUTE]: edge }} />;
}
