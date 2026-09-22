import type { PointerEvent } from 'react';
import { isDateString } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import { type AllDayDraft, dayDraft, dayVibration, type EventDraft } from './draft.ts';
import { useRangeDrag } from './use-range-drag.ts';

/**
 * 日のセル（月表示、タイムラインの終日欄）をなぞって終日の期間を選ぶ。
 * ドラッグはセルをまたぐので、日は要素の親子ではなく画面の位置（`data-date` を持つ一番上の要素）から引く。
 * タッチの軽いタップは選択にせず、`onTapDate`（日表示へ移る）に渡す。
 * 日をまたいで選ぶ範囲が変わるたびに震わせる（`dayVibration`）。
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
  const drag = useRangeDrag<DateString, DateString, AllDayDraft>({
    locate,
    // 端をつまんだときは動かさない方の端（掴んだ物）を起点に選び直す。空いている所からは押した日が起点
    rangeOf: ({ grab, from, to }) => dayDraft(grab ?? from, to),
    onChange,
    vibration: dayVibration,
    onTouchTap: onTapDate,
  });
  return {
    props: drag.props,
    /** 端の丸をつまんで広げ縮めする。anchor は動かさない方の端 */
    handleProps: (anchor: DateString) => drag.grabProps(anchor, { instant: true }),
  };
}
