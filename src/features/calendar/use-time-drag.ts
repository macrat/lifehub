import type { PointerEvent } from 'react';
import { isDateString } from '../../../shared/date.ts';
import {
  DAY_MINUTES,
  type EventDraft,
  type TimedDraft,
  type TimeGrab,
  type TimePoint,
  timeDraft,
  timeVibration,
} from './draft.ts';
import { useRangeDrag } from './use-range-drag.ts';

/** 時間軸（`data-time-grid`）の中で、その x にある列（`data-date`）。外にはみ出したら端の列に寄せる */
function columnAt(grid: HTMLElement, clientX: number): HTMLElement | undefined {
  const columns = [...grid.querySelectorAll<HTMLElement>('[data-date]')];
  return columns.findLast((c) => c.getBoundingClientRect().left <= clientX) ?? columns[0];
}

/**
 * 時間軸（週・日表示）をなぞって時間帯を選ぶ。下書きは端をつまんで広げ縮め、枠をつまんで動かせる。
 * 日は指の下にある列、分はその列の中での位置の割合で求める（列はどれも上端が同じで、高さが 1 日ぶん）。
 * 1 時間が何 px かは CSS が持っているので（`use-hour-zoom.ts`）、同じ数を持たずに描かれた物から読む。
 * つまんで伸び縮みさせた直後でも、測るのはその時点の列なのでずれない。
 * 列を掴んだ要素からではなく位置から引くので、枠をつまんだまま隣の日へ持っていける。
 * 探すのは同じ時間軸の列だけで、その外（終日欄・別の面）の日は拾わない。
 * 15 分に吸着して時刻が変わるたび、その時刻に応じた長さで震わせる（`timeVibration`）。
 */
export function useTimeDrag({
  onChange,
}: {
  onChange: (draft: EventDraft, done: boolean) => void;
}) {
  const locate = (event: PointerEvent<HTMLElement>): TimePoint | null => {
    const grid = event.currentTarget.closest<HTMLElement>('[data-time-grid]');
    const column = grid ? columnAt(grid, event.clientX) : undefined;
    const date = column?.dataset.date;
    if (!column || date === undefined || !isDateString(date)) return null;
    const { top, height } = column.getBoundingClientRect();
    return { date, min: ((event.clientY - top) / height) * DAY_MINUTES };
  };
  const drag = useRangeDrag<TimePoint, TimeGrab, TimedDraft>({
    locate,
    rangeOf: timeDraft,
    onChange,
    vibration: timeVibration,
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
