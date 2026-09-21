import type { DateString } from '../../../../shared/types.ts';
import type { EventDraft } from '../draft.ts';
import type { CalendarItem } from '../queries.ts';
import type { CalendarPeriod, PeriodView } from '../use-calendar-page.ts';
import { usePaneItems } from '../use-pane-items.ts';
import { MonthGrid } from './MonthGrid.tsx';
import { TimelineView } from './TimelineView.tsx';

type Props = {
  view: PeriodView;
  /** この面が受け持つ 1 ページ分（前後の面は表示中の前後の期間） */
  period: CalendarPeriod;
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
 * 枠（日付の並び）は取得も項目の描画も待たずに出し、項目は次の描画で載せる（use-pane-items.ts）。
 */
export function CalendarPane({
  view,
  period,
  onSelectDate,
  onSelectItem,
  draft,
  onChangeDraft,
}: Props) {
  const itemsByDate = usePaneItems(period.range);

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
}
