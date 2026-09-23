import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DateRange } from '../../../shared/calendar.ts';
import { DRAFT_SELECTOR } from './components/DraftBlock.tsx';

/**
 * 月グリッド（`MonthGrid`）の寸法とスクロール。
 * - 1 週の行に入るレーン数を、最初の週の行の実測から決める（行の高さは画面の残りを 6 週で等分した値）。
 *   返す `firstWeekRef` を最初の週の行に付ける
 * - シートに隠れる所に枠を置いたら（下の週を長押ししたときなど）、その帯が見える所まで送る。
 *   返す `scrollRef` をスクロールする要素に付ける
 */
export function useMonthGrid({
  laneHeight,
  headerHeight,
  draftSpan,
  bottomInset,
}: {
  /** 1 レーンの高さ（px） */
  laneHeight: number;
  /** 週の行の中で、レーンの上に取る日付の数字の高さ（px） */
  headerHeight: number;
  /** 置き終えた（指を離した）枠が掛かる期間。無い・なぞっている最中なら null */
  draftSpan: DateRange | null;
  /** シートが下から覆っている高さ（px） */
  bottomInset: number;
}) {
  const firstWeekRef = useRef<HTMLDivElement>(null);
  const [maxLanes, setMaxLanes] = useState(3);
  useLayoutEffect(() => {
    const el = firstWeekRef.current;
    if (!el) return;
    const measure = () => {
      const lanes = Math.floor((el.clientHeight - headerHeight - 2) / laneHeight);
      setMaxLanes(Math.max(1, lanes));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [laneHeight, headerHeight]);

  // どこまでが見える所かはスクロールする所の scroll-padding（シートが覆う分）が決めるので、
  // 送るのはブラウザに任せる（既に見えているなら `nearest` は動かさない）。
  // なぞっている最中は送らない（期間が null）: 指の下でグリッドが動くと、掴んでいる日がずれる
  const scrollRef = useRef<HTMLDivElement>(null);
  const reveal = draftSpan && `${draftSpan.from}/${draftSpan.to}/${bottomInset}`;
  useEffect(() => {
    if (!reveal) return;
    // 帯は週の行ごとに分かれるので、始まりの 1 本が見えれば足りる
    scrollRef.current
      ?.querySelector(DRAFT_SELECTOR)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [reveal]);

  return { firstWeekRef, scrollRef, maxLanes };
}
