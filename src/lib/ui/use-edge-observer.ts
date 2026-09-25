import { type RefObject, useEffect, useEffectEvent } from 'react';

/** 端がこの距離まで近づいたら続きを読む（見えてから読み始めると、読み終わるまで空白が見える） */
const PRELOAD_MARGIN = '400px 0px';

/**
 * 一覧の端の見張り（`InfiniteScroll`、ホームのタイムライン）。読む物がある（onReach がある）間だけ見張る。
 * 見張り始めるとその時点で見えているかを知らせてくるので、読み終わって読む物が戻るたびに端がまだ見えていれば、
 * 続けて次を読む。読み込み中は onReach を渡さないことで、二重に読まない
 */
export function useEdgeObserver(
  ref: RefObject<HTMLElement | null>,
  onReach: (() => void) | undefined,
) {
  const reach = useEffectEvent(() => onReach?.());
  const enabled = onReach !== undefined;
  useEffect(() => {
    const edge = ref.current;
    if (!enabled || !edge) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) reach();
      },
      { rootMargin: PRELOAD_MARGIN },
    );
    observer.observe(edge);
    return () => observer.disconnect();
  }, [ref, enabled]);
}
