import { useState } from 'react';
import { addDays, today } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';

/**
 * 週間天気で 3 時間ごとの天気を開いている日。今日と明日は最初から開いておく（3 時間ごとの予報があるのは
 * 明日の終わりまでで、開いてすぐ見たいのもこの 2 日）。押すたびに開け閉めする。
 * 最初から開く日かどうかと、押して反転させた日の集合とで決めるので、日付が変わっても押した分だけが残る。
 */
export function useExpandedDays() {
  const [toggled, setToggled] = useState<ReadonlySet<DateString>>(new Set());
  const now = today();
  const initiallyOpen = (date: DateString) => date === now || date === addDays(now, 1);
  return {
    isOpen: (date: DateString) => initiallyOpen(date) !== toggled.has(date),
    toggle: (date: DateString) =>
      setToggled((prev) => {
        const next = new Set(prev);
        if (!next.delete(date)) next.add(date);
        return next;
      }),
  };
}
