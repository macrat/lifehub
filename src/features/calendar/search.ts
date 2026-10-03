import { z } from 'zod';
import {
  type CalendarItem,
  groupByDate,
  inRange,
  isCompletedTask,
} from '../../../shared/calendar.ts';
import type { DateRange } from '../../../shared/date.ts';
import { matchesKeyword } from '../../../shared/search.ts';
import type { DateString } from '../../../shared/types.ts';
import { dateStringSchema } from '../../../shared/validation/common.ts';
import { addSearchSchema } from '../../lib/add-search.ts';
import { toMonthString } from '../../lib/date.ts';
import type { FilterConditions, Filters, FiltersPatch } from '../../lib/search.ts';
import { type CalendarView, viewSchema } from './view.ts';

/**
 * カレンダー画面の検索パラメータ（表示・日付・リスト表示の絞り込み）と、そこから導く絞り込みの規則。
 * 選択欄の値の型は、ここのスキーマから導く（書き写すと、選択肢を足したときにずれる）。
 */

/** リスト表示の種別の絞り込み */
const kindFilterSchema = z.enum(['event', 'task']);
/** リスト表示の完了状態の絞り込み。open = 未完了のみ、done = 完了のみ（予定は除く） */
const completedFilterSchema = z.enum(['open', 'done']);

const LAST_VIEW_KEY = 'calendar-view';

/**
 * 最後に開いた表示。URL に表示が無いとき（下部ナビのタブ、ショートカットから来たとき）
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

/** 開いた表示を覚える（`storedView`） */
export function storeView(view: CalendarView): void {
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
  /** 予定は今見ている日の終日の下書きを置いて開き（`useCalendarPage` の previewDay）、タスクはその場でフォームを開く */
  add: addSearchSchema('/calendar'),
  // 以下はリスト表示の絞り込み
  /** 期間の絞り込み。省略した端へは無限スクロールでどこまでも広がる */
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
  // 省略は「絞り込まない」。立替・レモンと同じく「すべて」を値として URL に残さない（`src/lib/search.ts` の ALL）
  kind: kindFilterSchema.optional(),
  /** 参加者のユーザー ID */
  participant: z.string().optional(),
  completed: completedFilterSchema.optional(),
  q: z.string().optional(),
});
export type CalendarSearch = z.infer<typeof calendarSearchSchema>;
/** 更新する項目だけ。undefined はその項目を消す（既定に戻す） */
export type SearchPatch = { [K in keyof CalendarSearch]?: CalendarSearch[K] | undefined };

/**
 * リスト表示の絞り込み。キーワードだけは URL ではなく画面の状態（打ちかけの値）から来る
 * （`src/lib/search.ts` の `useKeywordSearch`）。
 */
type ListFilterKey = 'from' | 'to' | 'kind' | 'participant' | 'completed';
export type ListFilters = Pick<Filters<CalendarSearch>, ListFilterKey | 'q'>;

/** 絞り込みのフォームが更新する項目だけ。undefined は既定に戻す。キーワードは AppBar の検索窓が持つのでここには無い */
export type ListFiltersPatch = Pick<FiltersPatch<CalendarSearch>, ListFilterKey>;

/** 絞り込みボタンのバッジに数える条件（`FilterConditions`）。期間は両端で 1 つ、キーワードは検索窓に見えているので数えない */
export const LIST_FILTER_CONDITIONS: FilterConditions<CalendarSearch> = [
  ['kind'],
  ['participant'],
  ['completed'],
  ['from', 'to'],
];

/** 項目が絞り込みに当たるか。期間はサーバーに投げるので、ここではそれ以外を手元で掛ける */
export function matchesListFilters(item: CalendarItem, f: ListFilters): boolean {
  if (f.kind !== undefined && item.kind !== f.kind) return false;
  if (f.participant !== undefined && !item.participantIds.includes(f.participant)) return false;
  if (f.completed === 'open' && isCompletedTask(item)) return false;
  if (f.completed === 'done' && !isCompletedTask(item)) return false;
  return matchesKeyword(f.q, item.title, item.location, item.note);
}

/** リスト表示の 1 か月の区切り。日は古い順で、日ごとの項目はサーバーの並びのまま */
export type ListSection = { month: string; days: [DateString, CalendarItem[]][] };

/**
 * リスト表示に並べるもの: 読んだ期間（range）の項目に絞り込みを掛け、日ごと・月ごとにまとめる。
 * 月は出している月（months）をすべて並べ、項目の無い月も見出しだけ出す。
 * 基準の日（date）は期間の中なら項目が無くても空の日として入れ、今どこにいるかを示す。
 */
export function listSections(
  items: CalendarItem[],
  filters: ListFilters,
  { months, date, range }: { months: string[]; date: DateString; range: DateRange },
): ListSection[] {
  const byDate = groupByDate(items.filter((item) => matchesListFilters(item, filters)));
  if (inRange(date, range) && !byDate.has(date)) byDate.set(date, []);
  const byMonth = Map.groupBy(
    [...byDate].sort(([a], [b]) => a.localeCompare(b)),
    ([day]) => toMonthString(day),
  );
  return months.map((month) => ({ month, days: byMonth.get(month) ?? [] }));
}
