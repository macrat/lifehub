import { useCallback, useEffect, useState } from 'react';
import {
  addDays,
  addMonths,
  type DateRange,
  firstDayOfMonth,
  monthsInRange,
  today,
  toMonthString,
} from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import {
  formatDateWithYear,
  formatMonth,
  formatWeekRange,
  monthGridDays,
  weekDays,
} from '../../lib/date.ts';
import { useFilterSearch, usePatchSearch } from '../../lib/search.ts';
import {
  type CalendarSearch,
  LIST_FILTER_CONDITIONS,
  type SearchPatch,
  storeView,
} from './search.ts';
import { useHourZoom } from './use-hour-zoom.ts';
import { type ListMonths, useListMonths } from './use-list-months.ts';
import type { CalendarView } from './view.ts';

/** 期間で見る表示。リストだけは期間が絞り込みで決まるので別扱い */
export type PeriodView = Exclude<CalendarView, 'list'>;

/** 期間で見る表示の 1 ページ分（1 か月・1 週・1 日）。スワイプでは前後のページも同時に描く */
export type PeriodPage = {
  /** そのページを代表する日（月なら 1 日）。ページが変わったことの判定に使う */
  date: DateString;
  /** 月表示で月外の日を薄く出すための "YYYY-MM" */
  month: string;
  /** 表示する日（月は 42 日、週は 7 日、日は 1 日） */
  days: DateString[];
  /** 取得範囲（両端含む） */
  range: DateRange;
};

/**
 * カレンダー画面の状態は検索パラメータで決まる（表示・日付・絞り込み）。
 * ここでパラメータから「表示する期間」「見出し」「前後への移動」を導き、ページは描画に専念する。
 * URL に載せない状態（打ちかけのキーワード、絞り込みのフォームの開閉、時間軸の高さ、追加の間だけの日表示）もここで持つ。
 * 画面の状態を探す所を 1 か所に保つため。
 */
export function useCalendarPage(search: CalendarSearch) {
  const patchSearch = usePatchSearch();
  // リスト表示の検索と絞り込み（ホーム・立替・レモンと同じ `useFilterSearch`）
  const filter = useFilterSearch(search, LIST_FILTER_CONDITIONS);
  // 時間軸の高さ（週・日）。3 面で 1 つの値を使う（`use-hour-zoom.ts`）
  const { hourHeight, zoom } = useHourZoom();
  // 開いた表示を覚える（URL の表示だけ。戻る・進むで開いた表示も含み、追加の間だけの日表示は含まない）
  useEffect(() => storeView(search.view), [search.view]);
  /**
   * 追加ボタンから予定を入れる間だけ、月・リストの代わりに日表示を出すか。時間帯を見ながら入れたいが、
   * 月とリストには時間軸が無いため。URL には載せないので、入力を閉じて false に戻せば元の表示がそのまま出る
   * （表示を URL で切り替えると、閉じたときに元の表示へ戻す移動と履歴の後始末が要る）。
   * 週・日はそのまま時間軸に下書きを置けるので切り替えない。
   */
  const [dayPreview, setDayPreview] = useState(false);
  const view: CalendarView = dayPreview ? 'day' : search.view;
  /**
   * 今の表示に月表示から切り替えてきたか。週・日の時間軸は、月から来たときだけ最初の縦位置を
   * 予定に合わせる（`useTimelineScroll`）。月で日を選んで開いたときは予定を見に来ているが、
   * 週・日を直接開いたときは今の時刻を見たいことが多いので、そちらは今までどおり今の時刻に合わせる。
   * 切り替えの経路（表示の切替・日付のタップ・戻る）を問わず拾えるよう、関数ではなく表示の移り変わりで見る
   */
  const [arrival, setArrival] = useState({ view, fromMonth: false });
  if (arrival.view !== view) setArrival({ view, fromMonth: arrival.view === 'month' });
  const date: DateString = search.date ?? today();
  const month = toMonthString(date);

  // リスト表示で出している月（無限スクロールで前後に広げる）
  const list = useListMonths(date, filter.filters);
  // 年月・週・日の選択ダイアログで送っている月。開いていなければ null
  const [pickerMonth, setPickerMonth] = useState<string | null>(null);

  /** offset ページ前後を代表する日（月は n か月、週は n 週、日は n 日ずらす） */
  const dateAt = (offset: number): DateString =>
    view === 'month'
      ? firstDayOfMonth(addMonths(month, offset))
      : addDays(date, offset * (view === 'week' ? 7 : 1));

  const title =
    view === 'month'
      ? formatMonth(date)
      : view === 'week'
        ? formatWeekRange(weekDays(date)[0] ?? date)
        : formatDateWithYear(date);

  /**
   * 検索パラメータの更新。表示や日付の切り替えは履歴に積み（戻るで前の表示に戻れる）、
   * スワイプでの前後移動は置き換える（戻るが連打の巻き戻しにならない。絞り込みは `filter.setFilters`）
   */
  // useCallback: この関数から作る openDay は面（CalendarPane）に渡る。毎回別の関数になると
  // 面が props の同一性で描き直しを省けなくなり、スワイプのたびに 3 面すべてを描き直すことになる
  const setSearch = useCallback(
    (next: SearchPatch, { replace = false } = {}) => patchSearch(next, { replace }),
    [patchSearch],
  );
  /**
   * 表示の切り替え。keepVisible には、切り替えた先でも見ていたい日を渡す（タップした日、
   * 入力中の下書きの初日）。表示ごとに一度に出せる期間の広さが違うので、渡された日を代表日にして
   * その期間に必ず入るようにする。リスト表示では最初に一番上へ出す日になる。
   */
  const changeView = useCallback(
    (next: CalendarView, keepVisible?: DateString) => {
      // 自分で選んだ表示は、追加が終わってもそのまま残す
      setDayPreview(false);
      return setSearch(keepVisible ? { view: next, date: keepVisible } : { view: next });
    },
    [setSearch],
  );
  const openDay = useCallback((d: DateString) => changeView('day', d), [changeView]);

  /** 前後の月・週・日へ（スワイプ） */
  const move = (direction: 1 | -1) => setSearch({ date: dateAt(direction) }, { replace: true });

  const pages = [dateAt(-1), dateAt(0), dateAt(1)] as const;

  return {
    view,
    date,
    month,
    /** スワイプで同時に描く 3 ページ（前・今・次）を代表する日 */
    pages,
    /** 画面に出している月（面・リスト・選択ダイアログ）。画面はこの月の項目と祝日・天気を購読する */
    months: shownMonths(view, pages, list, pickerMonth),
    list,
    /** 年月・週・日の選択ダイアログ。month は送っている月（開いていなければ null） */
    picker: {
      month: pickerMonth,
      open: () => setPickerMonth(toMonthString(date)),
      close: () => setPickerMonth(null),
      setMonth: setPickerMonth,
    },
    title,
    /** リスト表示の検索と絞り込み（`useFilterSearch`） */
    filter,
    hourHeight,
    zoom,
    /** 月表示から切り替えてきたか（週・日の最初の縦位置を予定に合わせる） */
    fromMonth: arrival.fromMonth,
    move,
    goToday: () => setSearch({ date: today() }),
    openDay,
    changeView,
    /** 追加ボタンからの予定の入力を始める。時間軸の無い表示（月・リスト）なら、閉じるまで日表示を出す */
    previewDay: () => setDayPreview(search.view === 'month' || search.view === 'list'),
    /** 予定の入力を閉じた。日表示を出していたなら元の表示に戻す */
    endPreview: () => setDayPreview(false),
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

/**
 * 画面に出している月（昇順）。面はスワイプで前後のページも描くので 3 ページ分、リストは広げた月、
 * 週・日の選択ダイアログは送っている月のグリッド（祝日を出す）。どれも同じ月のキャッシュを読むので、
 * 画面はこの月をまとめて購読する。
 */
function shownMonths(
  view: CalendarView,
  pages: readonly DateString[],
  list: ListMonths,
  pickerMonth: string | null,
): string[] {
  const ranges: DateRange[] =
    view === 'list' ? [list.range] : pages.map((d) => periodOf(view, d).range);
  const pickerDays = pickerMonth && view !== 'month' ? monthGridDays(pickerMonth) : [];
  const [first, last] = [pickerDays[0], pickerDays.at(-1)];
  if (first && last) ranges.push({ from: first, to: last });
  return [...new Set(ranges.flatMap((range) => monthsInRange(range.from, range.to)))].sort();
}

/**
 * 1 ページ分（1 か月・1 週・1 日）。表示とそのページを代表する日だけで決まるので、
 * 面（CalendarPane）は代表日だけを受け取ってここで期間を組み立てる。
 * 期間そのものを props にすると、中身が同じでも描画のたびに別の値になり、面が描き直しを省けない。
 */
export function periodOf(view: PeriodView, date: DateString): PeriodPage {
  const month = toMonthString(date);
  const days = view === 'month' ? monthGridDays(month) : view === 'week' ? weekDays(date) : [date];
  return { date, month, days, range: { from: days[0] ?? date, to: days.at(-1) ?? date } };
}
