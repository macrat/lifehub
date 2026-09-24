import type { QueryClient } from '@tanstack/react-query';
import {
  type CalendarItem,
  type CalendarPeriod,
  type DateRange,
  normalizeInstants,
  type Occurrence,
  placeOccurrence,
  sortItems,
} from '../../../shared/calendar.ts';
import { monthRange } from '../../lib/date.ts';
import type { CreateEventBody, UpdateEventBody } from './queries.ts';
import { CALENDAR_QUERY_KEY } from './query-keys.ts';
import type { WriteTarget } from './recurrence-options.ts';

/**
 * 予定・タスクの楽観的更新。保存を送ると同時に、サーバーが返すはずの項目を取得済みのカレンダーへ置く。
 * 暦日への割り当てと並びはサーバーと同じ規則（`shared/calendar.ts`）を使う。
 * 繰り返しの展開はサーバーにしかないので、投機的に出すのは操作した回だけ（残りの回は再取得で揃う）。
 */

/** 追加する予定・タスク。id はクライアントが決めて送るので、保存の前後で変わらない */
type NewEvent = CreateEventBody & { id: string };

/** 追加した予定・タスクを置く */
export function insertItem(client: QueryClient, input: NewEvent): void {
  updateCalendars(client, (items, range, now) => [
    ...items,
    ...placeOccurrence(toOccurrence(input), range, now),
  ]);
}

/**
 * 編集した内容を反映する。操作した回を作り直せるときは、元の項目を消して作り直した発生を置く:
 * - 単発（繰り返しでなくなる場合を含む）: 行そのもの
 * - 繰り返しの「この回だけ」: その回だけ。基準日時・繰り返しの設定は元の回のまま（回の行は繰り返さない）
 * 「これ以降」「すべて」は日時の変化がほかの回に及び、その展開はサーバーにしか無いので、
 * 日時を伴わない項目だけを当てる（残りは再取得で揃う）。
 */
export function updateItem(client: QueryClient, input: UpdateEventBody & { id: string }): void {
  const replacement = replacementOf(client, input);
  updateCalendars(client, (items, range, now) => {
    if (replacement) {
      return [
        ...items.filter((item) => !matches(item, input)),
        ...placeOccurrence(replacement, range, now),
      ];
    }
    return items.map((item) =>
      matches(item, input)
        ? {
            ...item,
            title: input.title,
            location: input.location ?? null,
            note: input.note ?? null,
            participantIds: input.participantIds,
          }
        : item,
    );
  });
}

/**
 * 編集した回を作り直した発生。作り直せない（ほかの回に及ぶ）ときは null。
 * 完了はこの更新で変わらない（サーバーも completed_at を触らない）ので、今の値を引き継ぐ。
 * 取得済みのカレンダー全体から先に探す（完了したタスクは完了日の月にしか無く、動かした先の月には居ない）。
 */
function replacementOf(
  client: QueryClient,
  input: UpdateEventBody & { id: string },
): Occurrence | null {
  const single = input.rrule == null && input.scope === 'all';
  if (!single && input.scope !== 'this') return null;
  const current = findItem(client, input);
  const occurrence = { ...toOccurrence(input), completedAt: current?.completedAt ?? null };
  if (input.scope !== 'this') return occurrence;
  return {
    ...occurrence,
    occurrenceStart: input.occurrenceStart,
    rrule: current?.rrule ?? occurrence.rrule,
    isRecurring: true,
    isModified: true,
  };
}

/** 削除した回を消す */
export function removeItem(client: QueryClient, target: WriteTarget): void {
  updateCalendars(client, (items) => items.filter((item) => !matches(item, target)));
}

/** 完了・完了取り消しを反映する（完了したタスクは完了日へ移る） */
export function setCompleted(client: QueryClient, target: WriteTarget, completed: boolean): void {
  const completedAt = completed ? new Date().toISOString() : null;
  updateCalendars(client, (items, range, now) =>
    items.flatMap((item) =>
      matches(item, target) ? placeOccurrence({ ...item, completedAt }, range, now) : [item],
    ),
  );
}

/** 取得済みのカレンダーから対象の今の項目を探す（どの月のキャッシュに居るかは完了日や日時で決まる） */
function findItem(client: QueryClient, target: WriteTarget): CalendarItem | undefined {
  for (const [, period] of client.getQueriesData<CalendarPeriod>({
    queryKey: CALENDAR_QUERY_KEY,
  })) {
    const found = period?.items.find((item) => matches(item, target));
    if (found) return found;
  }
  return undefined;
}

/**
 * 取得済みのカレンダー（暦月ごとのクエリ）の項目をまとめて書き換える。未取得のクエリには触らない。
 * 祝日と天気は書き込みで変わらないので、そのまま残す。
 */
function updateCalendars(
  client: QueryClient,
  update: (items: CalendarItem[], range: DateRange, now: Date) => CalendarItem[],
): void {
  const now = new Date();
  for (const [queryKey, period] of client.getQueriesData<CalendarPeriod>({
    queryKey: CALENDAR_QUERY_KEY,
  })) {
    const range = rangeOf(queryKey);
    if (!period || !range) continue;
    client.setQueryData<CalendarPeriod>(queryKey, {
      ...period,
      items: sortItems(update(period.items, range, now)),
    });
  }
}

/** クエリキー [calendar, YYYY-MM] が表す期間 */
function rangeOf(queryKey: readonly unknown[]): DateRange | null {
  const [, month] = queryKey;
  return typeof month === 'string' ? monthRange(month) : null;
}

/** 操作の対象に当たる項目か（この回だけ／これ以降／すべて） */
function matches(item: CalendarItem, target: WriteTarget): boolean {
  if (item.id !== target.id) return false;
  switch (target.scope) {
    case 'all':
      return true;
    case 'this':
      return item.occurrenceStart === target.occurrenceStart;
    case 'following':
      return item.occurrenceStart === null || item.occurrenceStart >= target.occurrenceStart;
  }
}

/** 保存を送った内容から、サーバーが返すはずの発生を組み立てる */
function toOccurrence(input: NewEvent): Occurrence {
  const instants = normalizeInstants(
    input.allDay ?? false,
    input.startsAt ? new Date(input.startsAt) : null,
    input.endsAt ? new Date(input.endsAt) : null,
  );
  return {
    id: input.id,
    kind: input.kind,
    title: input.title,
    allDay: input.allDay ?? false,
    startsAt: instants.startsAt?.toISOString() ?? null,
    endsAt: instants.endsAt?.toISOString() ?? null,
    completedAt: null,
    location: input.location ?? null,
    note: input.note ?? null,
    participantIds: input.participantIds,
    rrule: input.rrule ?? null,
    remindStartMinutes: input.remindStartMinutes ?? null,
    remindEndMinutes: input.remindEndMinutes ?? null,
    occurrenceStart: null,
    isRecurring: (input.rrule ?? null) !== null,
    isModified: false,
  };
}
