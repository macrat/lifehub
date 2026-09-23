import { useState } from 'react';
import type { Expense } from './queries.ts';

/** 一度に描き足す日数（見出しの数）。1 日は数行なので、これで画面数枚分になる */
const DAYS_PER_PAGE = 30;

/**
 * 履歴（古い順）のうち描く日。最初は新しいほうから DAYS_PER_PAGE 日で、上の端へ近づくと
 * 古いほうへ同じ日数ずつ描き足す（`InfiniteScroll`）。履歴はすべて手元にあるので取得は起きず、
 * 描く量だけを抑える。
 *
 * 描く範囲は日数ではなく「どの日から」で持つ。後から新しい日が足されても、上の古い日が
 * 押し出されて見ている所がずれない。日の途中では切らない（先頭のまとまりの中身が後から
 * 増えると、一覧の位置合わせが効かない）。
 * resetKey（絞り込み）が変わったら、新しいほうからの DAYS_PER_PAGE 日に戻す。
 */
export function useShownDays(expenses: Expense[], resetKey: string) {
  const days = [...Map.groupBy(expenses, (e) => e.spentOn)];
  const [stored, setStored] = useState<{ key: string; from: string | null }>({
    key: resetKey,
    from: null,
  });
  const from = stored.key === resetKey ? stored.from : null;
  const start =
    from === null
      ? Math.max(0, days.length - DAYS_PER_PAGE)
      : Math.max(
          0,
          days.findIndex(([date]) => date >= from),
        );
  return {
    days: days.slice(start),
    showEarlier:
      start > 0
        ? () =>
            setStored({
              key: resetKey,
              from: days[Math.max(0, start - DAYS_PER_PAGE)]?.[0] ?? null,
            })
        : undefined,
  };
}
