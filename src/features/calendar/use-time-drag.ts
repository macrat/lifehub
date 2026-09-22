import type { PointerEvent } from 'react';
import type { CalendarItem } from '../../../shared/calendar.ts';
import { isDateString } from '../../../shared/date.ts';
import {
  type Draft,
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
 * 時間軸（週・日表示）をなぞって時間帯を選ぶ。枠は端をつまんで広げ縮め、枠そのものをつまんで動かせる。
 * 保存済みの予定は長押しでつまむと編集モードに入り、そのまま指を離さずに動かせる。
 * 日は指の下にある列、分はその列の上端からの px で求める（列はどれも上端が同じ）。
 * 列を掴んだ要素からではなく位置から引くので、枠をつまんだまま隣の日へ持っていける。
 * 探すのは同じ時間軸の列だけで、その外（終日欄・別の面）の日は拾わない。
 * 15 分に吸着して時刻が変わるたび、その時刻に応じた長さで震わせる（`timeVibration`）。
 */
export function useTimeDrag({
  hourHeight,
  item,
  onChange,
}: {
  hourHeight: number;
  /** 今出ている枠が直している予定（追加の下書きなら null）。枠をつまんでも対象は変わらない */
  item: CalendarItem | null;
  onChange: (draft: Draft, done: boolean) => void;
}) {
  const locate = (event: PointerEvent<HTMLElement>): TimePoint | null => {
    const grid = event.currentTarget.closest<HTMLElement>('[data-time-grid]');
    const column = grid ? columnAt(grid, event.clientX) : undefined;
    const date = column?.dataset.date;
    if (!column || date === undefined || !isDateString(date)) return null;
    const y = event.clientY - column.getBoundingClientRect().top;
    return { date, min: (y / hourHeight) * 60 };
  };
  // 時間軸が決めるのは時間指定の枠だけ（終日は日の並びで選ぶ。`use-day-drag.ts`）
  const drag = useRangeDrag<TimePoint, TimeGrab, Draft & { range: TimedDraft }>({
    locate,
    // 範囲と一緒に「何を直しているか」を返す。空いている所からのドラッグ（grab が null）は
    // つまんだ予定を離れて、新しい予定の下書きになる
    rangeOf: (d) => ({ range: timeDraft(d), item: d.grab?.item ?? null }),
    onChange,
    vibration: (previous, next) => timeVibration(previous.range, next.range),
  });
  return {
    props: drag.props,
    /**
     * 枠をつまんで長さを保ったまま動かす。既につまんでいる予定を直すところなので長押しは待たない
     * （縦スクロール・横スワイプは枠の外から始める）。
     */
    moveProps: (draft: TimedDraft) =>
      drag.grabProps({ kind: 'move', draft, item }, { instant: true }),
    /** 端の丸をつまんでその端だけを動かす。丸は押す以外に使い道が無いので長押しを待たない */
    resizeProps: (kind: 'start' | 'end', draft: TimedDraft) =>
      drag.grabProps({ kind, draft, item }, { instant: true }),
    /**
     * 保存済みの予定を長押しでつまんで編集モードに入り、そのまま動かす。
     * 軽いタップは詳細（`ItemDetailSheet`）に譲るので、動かさずに離したときは何も選ばない。
     */
    grabItemProps: (draft: TimedDraft, target: CalendarItem) =>
      drag.grabProps({ kind: 'move', draft, item: target }, { tap: false }),
  };
}
