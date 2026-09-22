import type { PointerEvent } from 'react';
import { isDateString } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import { type DayGrab, type DayPoint, dayDraft, dayGrab, type EventDraft } from './draft.ts';
import { useRangeDrag } from './use-range-drag.ts';

/**
 * 日のセル（月表示、タイムラインの終日欄）をなぞって終日の期間を選ぶ。
 * ドラッグはセルをまたぐので、日は要素の親子ではなく画面の位置（`data-date` を持つ一番上の要素）から引く。
 * 出ている下書きに掛かる所を押したときは、その端か帯そのものをつまむ（`dayGrab`。押したセルの左右で決まる）。
 * つまむのはセルなので、帯が週の行をまたいでも（月表示で帯は行ごとに分かれる）掴んだ物を離さずに動かせる。
 * タッチの軽いタップは選択にせず、`onTapDate`（日表示へ移る）に渡す。
 */
export function useDayDrag({
  draft,
  onChange,
  onTapDate,
}: {
  /** 今出ている下書き。つまんだ所の意味づけ（端か、帯そのものか）に使う */
  draft: EventDraft | null;
  onChange: (draft: EventDraft, done: boolean) => void;
  onTapDate?: (date: DateString) => void;
}) {
  const locate = (event: PointerEvent<HTMLElement>): DayPoint | null => {
    const cell = document
      .elementsFromPoint(event.clientX, event.clientY)
      .find((el): el is HTMLElement => el instanceof HTMLElement && el.dataset.date !== undefined);
    const date = cell?.dataset.date;
    if (!cell || date === undefined || !isDateString(date)) return null;
    const { left, width } = cell.getBoundingClientRect();
    return { date, half: event.clientX < left + width / 2 ? 'left' : 'right' };
  };
  const drag = useRangeDrag<DayPoint, DayGrab, EventDraft>({
    locate,
    grabOf: (point) => dayGrab(draft, point),
    rangeOf: dayDraft,
    onChange,
    onTouchTap: onTapDate && ((point) => onTapDate(point.date)),
  });
  return drag.props;
}
