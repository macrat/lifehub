import { memo, useMemo } from 'react';
import type { DateString } from '../../../../shared/types.ts';
import type { EventDraft } from '../draft.ts';
import { type CalendarItem, groupByDate, useCalendarItems } from '../queries.ts';
import { type PeriodView, periodOf } from '../use-calendar-page.ts';
import { MonthGrid } from './MonthGrid.tsx';
import { TimelineView } from './TimelineView.tsx';

type Props = {
  view: PeriodView;
  /** この面が受け持つページを代表する日（月なら 1 日）。期間はここから組み立てる */
  date: DateString;
  onSelectDate: (date: DateString) => void;
  onSelectItem: (item: CalendarItem) => void;
  /** 追加しようとしている予定の範囲。控えの面には出さないので null が来る */
  draft: EventDraft | null;
  /** グリッドをなぞって範囲を選んだとき。done はポインタを離したか */
  onChangeDraft: (draft: EventDraft, done: boolean) => void;
};

/**
 * カレンダー 1 ページ分（1 か月・1 週・1 日）の表示。スワイプでは前後のページも同時に描くので、
 * 項目は面ごとに自分の範囲を読む（前後の分が先に読まれていて、スワイプした先も取得済み）。
 * 手元にまだ無い月は枠（日付の並び・曜日・今日）だけを出して待つ（枠そのものが骨組みになる）。
 * 描く量を抑えるための面の出し分けは入れ物（SwipePager）が受け持つので、ここは待たずに描き切る。
 *
 * memo: スワイプで 1 つ進んでも 3 面のうち 2 面は同じページのままなので、props が変わらなければ
 * 描き直さない。新しく要る端の 1 面は入れ物が次の描画に回すので、移動そのものの描画は空になる
 * （SwipePager 参照）。props は日付・表示のような値だけにし、渡す関数は呼び出し側で固定しておくこと。
 */
export const CalendarPane = memo(function CalendarPane({
  view,
  date,
  onSelectDate,
  onSelectItem,
  draft,
  onChangeDraft,
}: Props) {
  const period = useMemo(() => periodOf(view, date), [view, date]);
  const { data: items } = useCalendarItems(period.range);
  const itemsByDate = useMemo(() => groupByDate(items ?? []), [items]);

  return view === 'month' ? (
    <MonthGrid
      month={period.month}
      days={period.days}
      itemsByDate={itemsByDate}
      onSelectDate={onSelectDate}
      onSelectItem={onSelectItem}
      draft={draft}
      onChangeDraft={onChangeDraft}
      height="100%"
    />
  ) : (
    <TimelineView
      days={period.days}
      itemsByDate={itemsByDate}
      onSelectItem={onSelectItem}
      onSelectDate={view === 'week' ? onSelectDate : undefined}
      draft={draft}
      onChangeDraft={onChangeDraft}
      height="100%"
    />
  );
});
