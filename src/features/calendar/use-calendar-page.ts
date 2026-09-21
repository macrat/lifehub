import { useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import type { DateString } from '../../../shared/types.ts';
import { dateStringSchema } from '../../../shared/validation/common.ts';
import {
  addDays,
  addMonths,
  firstDayOfMonth,
  formatDateWithYear,
  formatMonth,
  formatWeekRange,
  monthGridDays,
  today,
  toMonthString,
  weekDays,
} from '../../lib/date.ts';
import { useKeywordSearch } from '../../lib/search.ts';
import type { ListFilters } from './components/ListView.tsx';

export const calendarSearchSchema = z.object({
  view: z.enum(['month', 'week', 'day', 'list']).default('month'),
  date: dateStringSchema.optional(),
  // 以下はリスト表示の絞り込み
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
  kind: z.enum(['all', 'event', 'task']).default('all'),
  participant: z.string().default('all'),
  completed: z.enum(['all', 'open', 'done']).default('all'),
  q: z.string().optional(),
});
export type CalendarSearch = z.infer<typeof calendarSearchSchema>;
/** 更新する項目だけ。undefined はその項目を消す（既定に戻す） */
export type SearchPatch = { [K in keyof CalendarSearch]?: CalendarSearch[K] | undefined };

/** 期間で見る表示。リストだけは期間が絞り込みで決まるので別扱い */
export type PeriodView = Exclude<CalendarSearch['view'], 'list'>;

/** 期間で見る表示の 1 ページ分（1 か月・1 週・1 日）。スワイプでは前後のページも同時に描く */
export type CalendarPeriod = {
  /** そのページを代表する日（月なら 1 日）。ページが変わったことの判定に使う */
  date: DateString;
  /** 月表示で月外の日を薄く出すための "YYYY-MM" */
  month: string;
  /** 表示する日（月は 42 日、週は 7 日、日は 1 日） */
  days: DateString[];
  /** 取得範囲（両端含む） */
  range: { from: DateString; to: DateString };
};

/**
 * カレンダー画面の状態は検索パラメータで決まる（表示・日付・絞り込み）。
 * ここでパラメータから「表示する期間」「見出し」「前後への移動」を導き、ページは描画に専念する。
 * キーワードだけは例外で手元に持つ（下記）。
 */
export function useCalendarPage(search: CalendarSearch) {
  const navigate = useNavigate({ from: '/calendar' });
  // キーワードは打つたびに反映するので、URL を往復させず手元に持つ（URL は置き換えるだけ）
  const [query, setQuery] = useKeywordSearch(search.q ?? '');
  const { view } = search;
  const date: DateString = search.date ?? today();
  const month = toMonthString(date);

  const filters: ListFilters = {
    from: search.from ?? addDays(date, -7),
    to: search.to ?? addDays(date, 21),
    kind: search.kind,
    participant: search.participant,
    completed: search.completed,
    q: query,
  };
  const activeFilters = [
    search.kind !== 'all',
    search.participant !== 'all',
    search.completed !== 'all',
    search.from !== undefined || search.to !== undefined,
  ].filter(Boolean).length;

  /** offset ページ前後を代表する日（月は n か月、週は n 週、日は n 日ずらす） */
  const dateAt = (offset: number): DateString =>
    view === 'month'
      ? firstDayOfMonth(addMonths(month, offset))
      : addDays(date, offset * (view === 'week' ? 7 : 1));

  /** offset ページ前後の範囲。0 が表示中で、前後はスワイプ中に見せる面になる */
  const periodAt = (offset: number): CalendarPeriod => {
    const d = dateAt(offset);
    const m = toMonthString(d);
    const days = view === 'month' ? monthGridDays(m) : view === 'week' ? weekDays(d) : [d];
    return { date: d, month: m, days, range: { from: days[0] ?? d, to: days.at(-1) ?? d } };
  };

  const period = periodAt(0);
  const title =
    view === 'month'
      ? formatMonth(date)
      : view === 'week'
        ? formatWeekRange(period.range.from)
        : formatDateWithYear(date);

  /**
   * 検索パラメータの更新。表示や日付の切り替えは履歴に積み（戻るで前の表示に戻れる）、
   * スワイプでの前後移動と絞り込みの入力は置き換える（戻るが連打の巻き戻しにならない）
   */
  const setSearch = (next: SearchPatch, { replace = false } = {}) =>
    // resetScroll: false = 画面のスクロール位置に触らない。既定だと router が移動のたびに位置を復元し、
    // スワイプの面（SwipePager）を中央へ戻した直後に元の位置へ引き戻してしまう
    navigate({ search: (prev) => ({ ...prev, ...next }), replace, resetScroll: false });

  /** 前後の月・週・日へ（スワイプ） */
  const move = (direction: 1 | -1) => setSearch({ date: dateAt(direction) }, { replace: true });

  return {
    view,
    date,
    month,
    periodAt,
    title,
    filters,
    activeFilters,
    setQuery,
    setSearch,
    move,
    goToday: () => setSearch({ date: today() }),
    openDay: (d: DateString) => setSearch({ view: 'day', date: d }),
    /**
     * 選択ダイアログからの移動。受け取るのは選んだ月・週・日の最初の日。
     * その範囲が今日を含むなら今日にして、「今日」が選ばれている見え方に揃える。
     * ダイアログが持つ履歴の項目を選んだ結果で置き換える（積むと、戻ったときに中身のない項目を踏む）
     */
    selectDate: (d: DateString) => {
      const includesToday =
        view === 'month'
          ? toMonthString(d) === toMonthString(today())
          : view === 'week'
            ? weekDays(d).includes(today())
            : d === today();
      setSearch({ date: includesToday ? today() : d }, { replace: true });
    },
  };
}
