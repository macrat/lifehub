import { type PointerEvent, useRef } from 'react';
import { isDateString } from '../../../shared/date.ts';
import {
  type EventDraft,
  snapVibration,
  type TimedDraft,
  type TimeGrab,
  type TimePoint,
  timeDraft,
} from './draft.ts';
import { type DragHandlers, useRangeDrag } from './use-range-drag.ts';

/** 時間軸（`data-time-grid`）の中で、その x にある列（`data-date`）。外にはみ出したら端の列に寄せる */
function columnAt(grid: HTMLElement, clientX: number): HTMLElement | undefined {
  const columns = [...grid.querySelectorAll<HTMLElement>('[data-date]')];
  return columns.findLast((c) => c.getBoundingClientRect().left <= clientX) ?? columns[0];
}

/**
 * 時間軸（週・日表示）をなぞって時間帯を選ぶ。下書きは端をつまんで広げ縮め、枠をつまんで動かせる。
 * 日は指の下にある列、分はその列の上端からの px で求める（列はどれも上端が同じ）。
 * 列を掴んだ要素からではなく位置から引くので、枠をつまんだまま隣の日へ持っていける。
 * 探すのは同じ時間軸の列だけで、その外（終日欄・別の面）の日は拾わない。
 * 枠が 15 分に吸着して時刻が変わるたび、その時刻に応じた長さで震わせる（`snapVibration`）。
 */
export function useTimeDrag({
  hourHeight,
  onChange,
}: {
  hourHeight: number;
  onChange: (draft: EventDraft, done: boolean) => void;
}) {
  const locate = (event: PointerEvent<HTMLElement>): TimePoint | null => {
    const grid = event.currentTarget.closest<HTMLElement>('[data-time-grid]');
    const column = grid ? columnAt(grid, event.clientX) : undefined;
    const date = column?.dataset.date;
    if (!column || date === undefined || !isDateString(date)) return null;
    const y = event.clientY - column.getBoundingClientRect().top;
    return { date, min: (y / hourHeight) * 60 };
  };
  /** 直前に渡した枠。時刻が動いたときだけ震わせるための、1 回のドラッグの間だけの覚え */
  const previous = useRef<TimedDraft | null>(null);
  const drag = useRangeDrag<TimePoint, TimeGrab, TimedDraft>({
    locate,
    rangeOf: timeDraft,
    onChange: (draft, done) => {
      const ms = previous.current && snapVibration(previous.current, draft);
      // 対応しないブラウザ（iOS）では何も起こらない
      if (ms) navigator.vibrate?.(ms);
      previous.current = draft;
      onChange(draft, done);
    },
  });
  /** ドラッグの始めに前のドラッグの覚えを捨てる（取り消しで終わったとき、最初の枠で震わせない） */
  const fresh = (handlers: DragHandlers): DragHandlers => ({
    ...handlers,
    onPointerDown: (event) => {
      previous.current = null;
      handlers.onPointerDown(event);
    },
  });
  return {
    props: fresh(drag.props),
    /** 枠をつまんで長さを保ったまま動かす。枠は広いので、タッチは長押しから（縦スクロールに譲る） */
    moveProps: (draft: TimedDraft) => fresh(drag.grabProps({ kind: 'move', draft })),
    /** 端の丸をつまんでその端だけを動かす。丸は押す以外に使い道が無いので長押しを待たない */
    resizeProps: (kind: 'start' | 'end', draft: TimedDraft) =>
      fresh(drag.grabProps({ kind, draft }, { instant: true })),
  };
}
