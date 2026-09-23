import { useCallback, useEffect, useState } from 'react';
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
import { useKeywordSearch, usePatchSearch } from '../../lib/search.ts';
import { addSearchSchema } from '../add/shortcut.ts';
import type { ListFilters } from './components/ListView.tsx';
import { useRefreshCalendarItems } from './queries.ts';
import { useHourZoom } from './use-hour-zoom.ts';

const viewSchema = z.enum(['month', 'week', 'day', 'list']);
/** 表示の種類 */
export type CalendarView = z.infer<typeof viewSchema>;

const LAST_VIEW_KEY = 'calendar-view';

/**
 * 最後に開いた表示。URL に表示が無いとき（下部ナビのタブ、ホームの追加ボタン、ショートカットから来たとき）
 * の既定にして、毎回好みの表示へ切り替え直さずに済むようにする。検索パラメータを読むたび
 * （移動のたび）に読むので、画面が state を保ったままでも後から覚えた表示が反映される。
 * 置き場所は localStorage: 端末ごとの好みで、サーバーに送る物ではないため。読めない・壊れている
 * （プライベートブラウズ、消された）ときは月表示から始める。
 */
function storedView(): CalendarView {
  try {
    return viewSchema.catch('month').parse(localStorage.getItem(LAST_VIEW_KEY));
  } catch {
    return 'month';
  }
}

function storeView(view: CalendarView): void {
  try {
    localStorage.setItem(LAST_VIEW_KEY, view);
  } catch {
    // 覚えられなくても表示はできる。次に来たときに月表示から始まるだけ
  }
}

export const calendarSearchSchema = z.object({
  /** 無ければ最後に開いた表示（`storedView`） */
  view: viewSchema.default(storedView),
  date: dateStringSchema.optional(),
  /** 予定は今の表示に既定の時間帯の下書きを置いて開き（`useCalendarPage` の previewDay）、タスクはその場でフォームを開く */
  add: addSearchSchema('event', 'task'),
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
export type PeriodView = Exclude<CalendarView, 'list'>;

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
 * URL に載せない状態（打ちかけのキーワード、時間軸の高さ、追加の間だけの日表示）もここで持つ。
 * 画面の状態を探す所を 1 か所に保つため。
 *
 * 項目の取り直しは画面に入ったときだけ（`useRefreshCalendarItems`）。表示や日付の切り替えは
 * 検索パラメータが変わるだけでこの画面に留まるので、取り直さず手元のキャッシュをそのまま出す。
 */
export function useCalendarPage(search: CalendarSearch) {
  useRefreshCalendarItems();
  const patchSearch = usePatchSearch();
  // キーワードは打つたびに反映するので、URL を往復させず手元に持つ（URL は置き換えるだけ）
  const [query, setQuery] = useKeywordSearch(search.q ?? '');
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
  const date: DateString = search.date ?? today();
  const month = toMonthString(date);

  const filters: ListFilters = {
    from: search.from,
    to: search.to,
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

  const title =
    view === 'month'
      ? formatMonth(date)
      : view === 'week'
        ? formatWeekRange(weekDays(date)[0] ?? date)
        : formatDateWithYear(date);

  /**
   * 検索パラメータの更新。表示や日付の切り替えは履歴に積み（戻るで前の表示に戻れる）、
   * スワイプでの前後移動と絞り込みの入力は置き換える（戻るが連打の巻き戻しにならない）
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

  return {
    view,
    date,
    month,
    /** スワイプで同時に描く 3 ページ（前・今・次）を代表する日 */
    pages: [dateAt(-1), dateAt(0), dateAt(1)] as const,
    title,
    filters,
    activeFilters,
    setQuery,
    hourHeight,
    zoom,
    setSearch,
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
 * 1 ページ分（1 か月・1 週・1 日）。表示とそのページを代表する日だけで決まるので、
 * 面（CalendarPane）は代表日だけを受け取ってここで期間を組み立てる。
 * 期間そのものを props にすると、中身が同じでも描画のたびに別の値になり、面が描き直しを省けない。
 */
export function periodOf(view: PeriodView, date: DateString): CalendarPeriod {
  const month = toMonthString(date);
  const days = view === 'month' ? monthGridDays(month) : view === 'week' ? weekDays(date) : [date];
  return { date, month, days, range: { from: days[0] ?? date, to: days.at(-1) ?? date } };
}
