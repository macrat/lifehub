import { type CalendarItem, occurrenceKey } from './calendar.ts';
import { addDays, startOfDate, toDateString, today } from './date.ts';
import type { Expense } from './expenses.ts';
import type { CareLog } from './lemon.ts';
import type { Memo } from './memos.ts';
import { compareKeys } from './sort.ts';
import type { DateString } from './types.ts';

/**
 * ホームのタイムラインに並ぶ記録（予定・タスク・立替・レモン・メモ）と、それぞれを置く日時。
 * サーバーの組み立て（`server/features/timeline/service.ts`）と、クライアントの楽観的更新が
 * 同じ規則で日時を決めるため、共通に置く。
 */

type EntryBase = {
  /** タイムラインの中で一意な鍵（`timelineEntryId`。予定・タスクは回ごと） */
  id: string;
  /** 並べる日時。null はタイムラインの一番上にまとめるタスク（未完了で、開始を過ぎたもの。`sortTimeline`） */
  at: string | null;
  /** 日付だけを示す記録か（終日の予定・タスク、立替）。時刻は出さない */
  dateOnly: boolean;
};

export type TimelineEntry =
  | (EntryBase & { type: 'event'; item: CalendarItem })
  | (EntryBase & { type: 'expense'; at: string; expense: Expense })
  | (EntryBase & { type: 'lemon'; at: string; log: CareLog })
  | (EntryBase & { type: 'memo'; at: string; memo: Memo });

/** 1 件の記録が 1 行になる種類（予定・タスクは繰り返しの回ごとに行があるので `occurrenceKey`） */
type RecordType = Exclude<TimelineEntry['type'], 'event'>;

/** 記録からタイムラインの行の鍵を作る。書き込みの楽観的更新が、同じ記録の行を引き当てるのに使う */
export function timelineEntryId(type: RecordType, id: string): string {
  return `${type}:${id}`;
}

/**
 * 予定・タスクの行。時刻のある予定は始まる日時に置く。
 * 終日の予定は、置く日（`placeOnce`。今日を含めば今日）の終わり（23:59:59.999）に置く。今日を含む予定は、
 * 終わるまで今日の記録より上に出し続ける（始まりの 0:00 に置くと、その日の記録に押し流されて予定の最中なのに
 * 見えなくなる）。WHY NOT いつも終わる日に置く: 今日と明日にまたがる予定が明日の側に出て、今日の予定に見えなくなる。
 * タスクは完了していれば完了した日時に置く。
 * 未完了のタスクは、開始がまだ先ならその日時に置き、開始を過ぎていれば
 * 日時を持たない行としてタイムラインの一番上にまとめる（やるべきことを、いつも最初に目に入る所に出す）。
 */
export function eventEntry(item: CalendarItem, now: Date = new Date()): TimelineEntry {
  const base = { type: 'event' as const, id: occurrenceKey(item), item };
  if (item.kind === 'event') {
    if (!item.allDay) return { ...base, at: item.startsAt, dateOnly: false };
    const endOfDay = new Date(startOfDate(addDays(item.placementDate, 1)).getTime() - 1);
    return { ...base, at: endOfDay.toISOString(), dateOnly: true };
  }
  if (item.completedAt) return { ...base, at: item.completedAt, dateOnly: false };
  if (new Date(item.startsAt).getTime() > now.getTime()) {
    return { ...base, at: item.startsAt, dateOnly: item.allDay };
  }
  return { ...base, at: null, dateOnly: false };
}

/**
 * 立替の行。立替は使った日しか持たないので、その日に記録したものは記録した時刻に置き
 * （記録した直後の立替が、その日の他の記録と同じく一番上に出る）、
 * 後から記録したものはその日の始まりに置く。サーバーの問い合わせ（`expenses/repository.ts`）も同じ式で並べる。
 */
export function expenseEntry(expense: Expense): TimelineEntry {
  const at =
    toDateString(new Date(expense.createdAt)) === expense.spentOn
      ? expense.createdAt
      : startOfDate(expense.spentOn).toISOString();
  return {
    type: 'expense',
    id: timelineEntryId('expense', expense.id),
    at,
    dateOnly: true,
    expense,
  };
}

export function careLogEntry(log: CareLog): TimelineEntry {
  return {
    type: 'lemon',
    id: timelineEntryId('lemon', log.id),
    at: log.doneAt,
    dateOnly: false,
    log,
  };
}

export function memoEntry(memo: Memo): TimelineEntry {
  return {
    type: 'memo',
    id: timelineEntryId('memo', memo.id),
    at: memo.createdAt,
    dateOnly: false,
    memo,
  };
}

/** 行を置く日（JST の暦日）。日時を持たない行は今日にいる（最新のページに入る） */
export function entryDay(entry: TimelineEntry, now: Date = new Date()): DateString {
  return entry.at ? toDateString(new Date(entry.at)) : today(now);
}

/**
 * 記録が始まる日時。行を置く日時（`at`）と違うのは終日の予定だけ（置く日の終わりに置く）。
 * どこまで先を出すか（最新のページの上端）は、行の位置ではなくこちらで決める
 */
export function entryStart(entry: TimelineEntry): string | null {
  return entry.type === 'event' && entry.item.kind === 'event' ? entry.item.startsAt : entry.at;
}

/**
 * 並び: 古い順（アプリの履歴と同じ。タイムラインは画面で逆さに出す）。同じ日時は鍵の順。
 * 日時を持たない行（未完了のタスク）はいちばん新しい側（画面の一番上）にまとめ、その中は `topTaskKey` の順。
 * 並びはサーバーとクライアントで同じでなければならないので、文字列は符号位置で比べる（`compareKeys`）。
 */
export function sortTimeline(entries: TimelineEntry[]): TimelineEntry[] {
  const byKey = (key: (entry: TimelineEntry) => string) => (a: TimelineEntry, b: TimelineEntry) =>
    compareKeys(key(a), key(b)) || compareKeys(a.id, b.id);
  const dated = entries.filter((entry) => entry.at !== null).sort(byKey((e) => e.at ?? ''));
  // 画面の上からの順に並べてから逆さにする（古い順の並びでは、画面の一番上が最後に来る）
  const top = entries.filter((entry) => entry.at === null).sort(byKey(topTaskKey));
  return [...dated, ...top.reverse()];
}

/**
 * 一番上にまとめたタスクの、画面の上からの並びの鍵: 開始の古い順。長く放っておいたものほど上に出す。
 * 開始が同じなら `sortTimeline` が行の鍵で並べる。
 */
function topTaskKey(entry: TimelineEntry): string {
  return entry.type === 'event' ? entry.item.startsAt : '';
}
