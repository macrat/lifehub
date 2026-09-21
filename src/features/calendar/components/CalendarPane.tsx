import { useQuery } from '@tanstack/react-query';
import type { DateString } from '../../../../shared/types.ts';
import { type CalendarItem, calendarItemsQueryOptions, groupByDate } from '../queries.ts';
import type { CalendarPeriod, PeriodView } from '../use-calendar-page.ts';
import { MonthGrid } from './MonthGrid.tsx';
import { TimelineView } from './TimelineView.tsx';

type Props = {
  view: PeriodView;
  /** この面が受け持つ 1 ページ分（前後の面は表示中の前後の期間） */
  period: CalendarPeriod;
  onSelectDate: (date: DateString) => void;
  onSelectItem: (item: CalendarItem) => void;
};

/**
 * カレンダー 1 ページ分（1 か月・1 週・1 日）の表示。スワイプでは前後のページも同時に描くので、
 * 項目は面ごとに自分の範囲を読む（前後の分が先に読まれていて、スワイプした先がすぐ出る）。
 */
export function CalendarPane({ view, period, onSelectDate, onSelectItem }: Props) {
  const { data: items = [] } = useQuery(calendarItemsQueryOptions(period.range));
  const itemsByDate = groupByDate(items);

  return view === 'month' ? (
    <MonthGrid
      month={period.month}
      days={period.days}
      itemsByDate={itemsByDate}
      onSelectDate={onSelectDate}
      onSelectItem={onSelectItem}
      height="100%"
    />
  ) : (
    <TimelineView
      days={period.days}
      itemsByDate={itemsByDate}
      onSelectItem={onSelectItem}
      onSelectDate={view === 'week' ? onSelectDate : undefined}
      height="100%"
    />
  );
}
