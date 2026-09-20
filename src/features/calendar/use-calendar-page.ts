import { useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import type { DateString } from '../../../shared/types.ts';
import { dateStringSchema } from '../../../shared/validation/common.ts';
import {
  addDays,
  addMonths,
  formatDateRange,
  formatDateWithYear,
  formatMonth,
  monthGridDays,
  today,
  toMonthString,
  weekDays,
} from '../../lib/date.ts';
import type { ListFilters } from './components/ListView.tsx';

export const calendarSearchSchema = z.object({
  view: z.enum(['month', 'week', 'day', 'list']).default('month'),
  date: dateStringSchema.optional(),
  // 以下はリスト表示の絞り込み
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
  kind: z.enum(['all', 'event', 'task']).default('all'),
  owner: z.string().default('all'),
  completed: z.enum(['all', 'open', 'done']).default('all'),
  q: z.string().optional(),
});
export type CalendarSearch = z.infer<typeof calendarSearchSchema>;

/**
 * カレンダー画面の状態は検索パラメータだけで決まる（表示・日付・絞り込み）。
 * ここでパラメータから「取得範囲」「見出し」「前後への移動」を導き、ページは描画に専念する。
 */
export function useCalendarPage(search: CalendarSearch) {
  const navigate = useNavigate({ from: '/calendar' });
  const { view } = search;
  const date: DateString = search.date ?? today();
  const month = toMonthString(date);

  const filters: ListFilters = {
    from: search.from ?? addDays(date, -7),
    to: search.to ?? addDays(date, 21),
    kind: search.kind,
    owner: search.owner,
    completed: search.completed,
    q: search.q ?? '',
  };
  const activeFilters = [
    search.kind !== 'all',
    search.owner !== 'all',
    search.completed !== 'all',
    search.from !== undefined || search.to !== undefined,
  ].filter(Boolean).length;

  // 取得範囲: 月はグリッドの 42 日、週は 7 日、日は 1 日、リストは絞り込みの期間
  const days =
    view === 'month'
      ? monthGridDays(month)
      : view === 'week'
        ? weekDays(date)
        : view === 'day'
          ? [date]
          : [filters.from, filters.to];
  const range = { from: days[0] ?? date, to: days.at(-1) ?? date };

  const title =
    view === 'month'
      ? formatMonth(date)
      : view === 'week'
        ? formatDateRange(range.from, range.to)
        : formatDateWithYear(date);

  const setSearch = (next: Partial<CalendarSearch>) =>
    navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

  /** 前後の月・週・日へ（リスト表示では何もしない） */
  const move = (direction: 1 | -1) => {
    if (view === 'month') setSearch({ date: `${addMonths(month, direction)}-01` as DateString });
    else if (view === 'week') setSearch({ date: addDays(date, 7 * direction) });
    else if (view === 'day') setSearch({ date: addDays(date, direction) });
  };

  return {
    view,
    date,
    month,
    days,
    range,
    title,
    filters,
    activeFilters,
    setSearch,
    move,
    goToday: () => setSearch({ date: today() }),
    openDay: (d: DateString) => setSearch({ view: 'day', date: d }),
    /** 年月の選択: 今の月なら今日、それ以外は 1 日へ */
    selectMonth: (m: string) =>
      setSearch({ date: m === toMonthString(today()) ? today() : (`${m}-01` as DateString) }),
  };
}
