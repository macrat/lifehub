import type { PointerEvent } from 'react';
import type { CalendarItem } from '../../../shared/calendar.ts';
import { isDateString } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import { type DayGrab, dayDraft, dayGrab, dayVibration } from './day-draft.ts';
import { type Draft, itemDraft, type KindedDraft } from './draft.ts';
import { type DragHandlers, useRangeDrag } from './use-range-drag.ts';

/** ポインタの位置にある日のセル（`data-date` を持つ一番上の要素）と、その日 */
function cellAt(
  event: PointerEvent<HTMLElement>,
): { element: HTMLElement; date: DateString } | null {
  const element = document
    .elementsFromPoint(event.clientX, event.clientY)
    .find((el): el is HTMLElement => el instanceof HTMLElement && el.dataset.date !== undefined);
  const date = element?.dataset.date;
  return element && date !== undefined && isDateString(date) ? { element, date } : null;
}

/**
 * 日のセル（月表示、タイムラインの終日欄）をなぞって終日の期間を選ぶ。
 * ドラッグはセルをまたぐので、日は要素の親子ではなく画面の位置（`data-date` を持つ一番上の要素）から引く。
 * 出ている下書きに掛かる所を押したときは、選び直さずにその下書きをつまむ（つまむ所の決め方は `dayGrab`）。
 * つまむのはセルなので、帯が週の行をまたいでも（月表示で帯は行ごとに分かれる）掴んだ物を離さずに動かせる。
 * 保存済みの予定は長押しでつまむと編集モードに入り、そのまま日を動かせる（`grabItemProps`）。
 * 項目の無い所へのタッチの軽いタップは選択にせず、`onTapDate`（日表示へ移る）に渡す。
 * 日をまたいで範囲が変わるたびに震わせる（`dayVibration`）。選び直しでもつまんで動かしたときでも同じ。
 */
export function useDayDrag({
  draft,
  onChange,
  onTapDate,
}: {
  /** この面が日の並びに出している枠。つまんだ所の意味づけに使う（出していない枠は掴めない） */
  draft: KindedDraft | null;
  onChange: (draft: Draft, done: boolean) => void;
  onTapDate?: (date: DateString) => void;
}) {
  const drag = useRangeDrag<DateString, DayGrab, Draft>({
    locate: (event) => cellAt(event)?.date ?? null,
    // 掴んだ物は押した所（セルの左右どちら側か）で決まる。動かしている間は見ないので、矩形も押したときだけ読む
    grabOf: (event) => {
      const cell = cellAt(event);
      if (!cell) return null;
      const { left, width } = cell.element.getBoundingClientRect();
      return dayGrab(draft, cell.date, event.clientX < left + width / 2 ? 'left' : 'right');
    },
    // 範囲と一緒に「何を直しているか」を返す。空いている所からのドラッグ（grab が null）は
    // つまんだ予定を離れて、新しい予定の下書きになる
    rangeOf: (d) => ({ range: dayDraft(d), item: d.grab?.item ?? null }),
    onChange,
    vibration: (previous, next) => dayVibration(previous.range, next.range),
    onTouchTap: onTapDate,
  });
  return {
    /** 日のセルに渡す。帯はポインタを受けないので、つまむのも選び直すのもここから */
    props: drag.props,
    /**
     * 保存済みの予定・タスク（帯・項目）を長押しでつまんで編集モードに入り、そのまま動かす。
     * 軽いタップは項目自身の click（詳細を開く）に譲る。
     * 枠に出せない項目（完了したタスク、日をまたぐ時間指定の予定）はつまめないので undefined。
     */
    grabItemProps: (item: CalendarItem): DragHandlers | undefined => {
      const range = itemDraft(item);
      return range
        ? drag.grabProps({ kind: 'move', draft: range, item }, { tap: false })
        : undefined;
    },
  };
}
