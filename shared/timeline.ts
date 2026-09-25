import { type CalendarItem, occurrenceKey } from './calendar.ts';
import { startOfDate, toDateString, today } from './date.ts';
import type { Expense } from './expenses.ts';
import type { CareLog } from './lemon.ts';
import type { Memo } from './memos.ts';
import type { DateString } from './types.ts';

/**
 * ホームのタイムラインに並ぶ記録（予定・タスク・立替・レモン・メモ）と、それぞれを置く日時。
 * サーバーの組み立て（`server/features/timeline/service.ts`）と、クライアントの楽観的更新が
 * 同じ規則で日時を決めるため、共通に置く。
 */

type EntryBase = {
  /** タイムラインの中で一意な鍵（`timelineEntryId`。予定・タスクは回ごと） */
  id: string;
  /** 並べる日時。null はタイムラインの一番上にまとめるタスク（未完了で、開始を過ぎたか日時を持たないもの） */
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
 * 予定・タスクの行。時刻のある予定は始まる日時、終日の予定は終わる日の終わり（23:59:59.999）に置く。
 * 終日の予定は終わるまでその日の記録より上に出し続ける（始まりの 0:00 に置くと、その日の記録に押し流されて
 * 予定の最中なのに見えなくなる）。タスクは完了していれば完了した日時に置く。
 * 未完了のタスクは、開始がまだ先ならその日時に置き、開始を過ぎたか日時を持たなければ
 * 日時を持たない行としてタイムラインの一番上にまとめる（やるべきことを、過ぎた日時の位置に
 * 埋もれさせない）。期限は位置に使わない（まだ来ていない期限の位置に置くと、未来の側に埋もれる）。
 */
export function eventEntry(item: CalendarItem, now: Date = new Date()): TimelineEntry {
  const base = { type: 'event' as const, id: occurrenceKey(item), item };
  if (item.kind === 'event') {
    return item.allDay
      ? { ...base, at: new Date(new Date(item.endsAt).getTime() - 1).toISOString(), dateOnly: true }
      : { ...base, at: item.startsAt, dateOnly: false };
  }
  if (item.completedAt) return { ...base, at: item.completedAt, dateOnly: false };
  if (item.startsAt && new Date(item.startsAt).getTime() > now.getTime()) {
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
 * 並び: 古い順（アプリの履歴と同じ。タイムラインは画面で逆さに出す）。日時を持たない行はいちばん新しい側で、
 * その中は開始の古い順（画面では最近始まったタスクが上、開始の無いタスクがその下）。同じ日時は鍵の順。
 * 並びはサーバーとクライアントで同じでなければならないので、文字列は符号位置で比べる。
 */
export function sortTimeline(entries: TimelineEntry[]): TimelineEntry[] {
  const key = (entry: TimelineEntry) =>
    entry.at ?? `~${entry.type === 'event' ? (entry.item.startsAt ?? '') : ''}`;
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...entries].sort((a, b) => compare(key(a), key(b)) || compare(a.id, b.id));
}
