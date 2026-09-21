import type { PointerEvent } from 'react';
import { isDateString } from '../../../shared/date.ts';
import {
  type EventDraft,
  type TimedDraft,
  type TimeGrab,
  type TimePoint,
  timeDraft,
} from './draft.ts';
import { useRangeDrag } from './use-range-drag.ts';

/**
 * 時間軸（週・日表示）を縦になぞって時間帯を選ぶ。下書きは端をつまんで広げ縮め、枠をつまんで動かせる。
 * 位置は列（`data-date`）の上端からの px を分に直して求める。つまんだときも同じ列を見るので、
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
  const drag = useRangeDrag<TimePoint, TimeGrab, EventDraft>({
    locate,
    rangeOf: timeDraft,
    onChange,
  });
  return {
    props: drag.props,
    /** 枠をつまんで長さを保ったまま動かす。枠は広いので、タッチは長押しから（縦スクロールに譲る） */
    moveProps: (draft: TimedDraft) => drag.grabProps({ kind: 'move', draft }),
    /** 端の丸をつまんでその端だけを動かす。丸は押す以外に使い道が無いので長押しを待たない */
    resizeProps: (kind: 'start' | 'end', draft: TimedDraft) =>
      drag.grabProps({ kind, draft }, { instant: true }),
  };
}
