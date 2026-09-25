import { z } from 'zod';
import { isCompletedTask } from '../../../shared/calendar.ts';
import { matchesKeyword } from '../../../shared/search.ts';
import { dateStringSchema } from '../../../shared/validation/common.ts';
import { addSearchSchema } from '../../lib/add-search.ts';
import type { Filters, FiltersPatch } from '../../lib/search.ts';
import type { CalendarItem } from '../events/queries.ts';
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
  /** 予定は今の表示に既定の時間帯の下書きを置いて開き（`useCalendarPage` の previewDay）、タスクはその場でフォームを開く */
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

/** 効いている絞り込みの数（絞り込みボタンのバッジ）。期間は両端で 1 つ、キーワードは検索窓に見えているので数えない */
export function countActiveFilters(filters: ListFilters): number {
  return [
    filters.kind !== undefined,
    filters.participant !== undefined,
    filters.completed !== undefined,
    filters.from !== undefined || filters.to !== undefined,
  ].filter(Boolean).length;
}

/** 項目が絞り込みに当たるか。期間はサーバーに投げるので、ここではそれ以外を手元で掛ける */
export function matchesListFilters(item: CalendarItem, f: ListFilters): boolean {
  if (f.kind !== undefined && item.kind !== f.kind) return false;
  if (f.participant !== undefined && !item.participantIds.includes(f.participant)) return false;
  if (f.completed === 'open' && isCompletedTask(item)) return false;
  if (f.completed === 'done' && !isCompletedTask(item)) return false;
  return matchesKeyword(f.q, item.title, item.location, item.note);
}
