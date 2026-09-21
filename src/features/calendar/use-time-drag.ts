import type { PointerEvent } from 'react';
import { isDateString } from '../../../shared/date.ts';
import { type EventDraft, type TimePoint, timeDraft } from './draft.ts';
import { useRangeDrag } from './use-range-drag.ts';

/**
 * 時間軸（週・日表示）を縦になぞって時間帯を選ぶ。
 * 位置は列（`data-date`）の上端からの px を分に直して求める。端をつまんだときも同じ列を見るので、
 * 掴んだ要素からではなく `data-date` を持つ祖先から測る。
 */
export function useTimeDrag({
  hourHeight,
  onChange,
}: {
  hourHeight: number;
  onChange: (draft: EventDraft, done: boolean) => void;
}) {
  const locate = (event: PointerEvent<HTMLElement>): TimePoint | null => {
    const column = event.currentTarget.closest<HTMLElement>('[data-date]');
    const date = column?.dataset.date;
    if (!column || date === undefined || !isDateString(date)) return null;
    const y = event.clientY - column.getBoundingClientRect().top;
    return { date, min: (y / hourHeight) * 60 };
  };
  return useRangeDrag<TimePoint, EventDraft>({ locate, rangeOf: timeDraft, onChange });
}
