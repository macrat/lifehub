import type { PointerEvent } from 'react';
import { isDateString } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import { type DayGrab, dayDraft, dayGrab, dayVibration, type EventDraft } from './draft.ts';
import { useRangeDrag } from './use-range-drag.ts';

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
 * タッチの軽いタップは選択にせず、`onTapDate`（日表示へ移る）に渡す。
 * 日をまたいで範囲が変わるたびに震わせる（`dayVibration`）。選び直しでもつまんで動かしたときでも同じ。
 */
export function useDayDrag({
  draft,
  onChange,
  onTapDate,
}: {
  /** この面が日の並びに出している下書き。つまんだ所の意味づけに使う（出していない下書きは掴めない） */
  draft: EventDraft | null;
  onChange: (draft: EventDraft, done: boolean) => void;
  onTapDate?: (date: DateString) => void;
}) {
  const drag = useRangeDrag<DateString, DayGrab, EventDraft>({
    locate: (event) => cellAt(event)?.date ?? null,
    // 掴んだ物は押した所（セルの左右どちら側か）で決まる。動かしている間は見ないので、矩形も押したときだけ読む
    grabOf: (event) => {
      const cell = cellAt(event);
      if (!cell) return null;
      const { left, width } = cell.element.getBoundingClientRect();
      return dayGrab(draft, cell.date, event.clientX < left + width / 2 ? 'left' : 'right');
    },
    rangeOf: dayDraft,
    onChange,
    vibration: dayVibration,
    onTouchTap: onTapDate,
  });
  return drag.props;
}
