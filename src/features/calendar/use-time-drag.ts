import type { PointerEvent } from 'react';
import type { CalendarItem } from '../../../shared/calendar.ts';
import { DAY_MINUTES } from '../../../shared/constants.ts';
import { isDateString } from '../../../shared/date.ts';
import { type Draft, hasEnds, itemDraft, type TimedDraft } from './draft.ts';
import { draftKind, type GridDraft } from './grid-draft.ts';
import { type TimeGrab, type TimePoint, timeDraft, timeVibration } from './time-draft.ts';
import { type DragHandlers, useRangeDrag } from './use-range-drag.ts';

/** 時間軸（`data-time-grid`）の中で、その x にある列（`data-date`）。外にはみ出したら端の列に寄せる */
function columnAt(grid: HTMLElement, clientX: number): HTMLElement | undefined {
  const columns = [...grid.querySelectorAll<HTMLElement>('[data-date]')];
  return columns.findLast((c) => c.getBoundingClientRect().left <= clientX) ?? columns[0];
}

/**
 * 時間軸（週・日表示）をなぞって時間帯を選ぶ。枠は端をつまんで広げ縮め、枠そのものをつまんで動かせる。
 * 保存済みの予定は長押しでつまむと編集モードに入り、そのまま指を離さずに動かせる。
 * 日は指の下にある列、分はその列の中での位置の割合で求める（列はどれも上端が同じで、高さが 1 日ぶん）。
 * 1 時間が何 px かは CSS が持っているので（`use-hour-zoom.ts`）、同じ数を持たずに描かれた物から読む。
 * つまんで伸び縮みさせた直後でも、測るのはその時点の列なのでずれない。
 * 列を掴んだ要素からではなく位置から引くので、枠をつまんだまま隣の日へ持っていける。
 * 探すのは同じ時間軸の列だけで、その外（終日欄・別の面）の日は拾わない。
 * 15 分に吸着して時刻が変わるたび、その時刻に応じた長さで震わせる（`timeVibration`）。
 */
export function useTimeDrag({
  draft,
  onChange,
}: {
  /** この面が時間軸に出している枠。つまんでも直す対象は変わらない（`useDayDrag` と同じ渡し方） */
  draft: GridDraft | null;
  onChange: (draft: Draft, done: boolean) => void;
}) {
  const item = draft?.item ?? null;
  const locate = (event: PointerEvent<HTMLElement>): TimePoint | null => {
    const grid = event.currentTarget.closest<HTMLElement>('[data-time-grid]');
    const column = grid ? columnAt(grid, event.clientX) : undefined;
    const date = column?.dataset.date;
    if (!column || date === undefined || !isDateString(date)) return null;
    const { top, height } = column.getBoundingClientRect();
    return { date, min: ((event.clientY - top) / height) * DAY_MINUTES };
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
     * 出ている枠（`DraftBlock`）に渡すハンドラ。枠そのもので長さを保ったまま動かし、端（丸・線）で
     * 開始・終了を変える。どれも既に直している枠なので長押しは待たない（縦スクロール・横スワイプは
     * 枠の外から始める）。端の無い枠（タスク。`hasEnds`）では ends が null。
     */
    frameProps: (range: TimedDraft) => ({
      move: drag.grabProps({ kind: 'move', draft: range, item }, { instant: true }),
      ends:
        !draft || hasEnds(draftKind(draft))
          ? {
              start: drag.grabProps({ kind: 'start', draft: range, item }, { instant: true }),
              end: drag.grabProps({ kind: 'end', draft: range, item }, { instant: true }),
            }
          : null,
    }),
    /**
     * 保存済みの予定・タスクを長押しでつまんで編集モードに入り、そのまま動かす。
     * 軽いタップは詳細（`ItemDetailSheet`）に譲るので、動かさずに離したときは何も選ばない。
     * 時間軸に枠で出せない項目（完了したタスク、日をまたぐ時間指定の予定）はつまめないので undefined。
     */
    grabItemProps: (target: CalendarItem): DragHandlers | undefined => {
      const range = itemDraft(target);
      return range?.allDay === false
        ? drag.grabProps({ kind: 'move', draft: range, item: target }, { tap: false })
        : undefined;
    },
  };
}
