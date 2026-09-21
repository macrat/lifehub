import type { PointerEvent } from 'react';
import { isDateString } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import { dayDraft, type EventDraft } from './draft.ts';
import { useRangeDrag } from './use-range-drag.ts';

/**
 * 日のセル（月表示、タイムラインの終日欄）をなぞって終日の期間を選ぶ。
 * ドラッグはセルをまたぐので、日は要素の親子ではなく画面の位置（`data-date` を持つ一番上の要素）から引く。
 * タッチの軽いタップは選択にせず、`onTapDate`（日表示へ移る）に渡す。
 */
export function useDayDrag({
  onChange,
  onTapDate,
}: {
  onChange: (draft: EventDraft, done: boolean) => void;
  onTapDate?: (date: DateString) => void;
}) {
  const locate = (event: PointerEvent<HTMLElement>): DateString | null => {
    const cell = document
      .elementsFromPoint(event.clientX, event.clientY)
      .find((el): el is HTMLElement => el instanceof HTMLElement && el.dataset.date !== undefined);
    const date = cell?.dataset.date;
    return date !== undefined && isDateString(date) ? date : null;
  };
  return useRangeDrag<DateString, EventDraft>({
    locate,
    rangeOf: dayDraft,
    onChange,
    onTouchTap: onTapDate,
  });
}
