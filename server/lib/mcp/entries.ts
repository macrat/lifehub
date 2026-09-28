import type { CalendarItem, EventMaster } from '../../../shared/calendar.ts';
import type { Balance, Expense } from '../../../shared/expenses.ts';
import type { CareLog } from '../../../shared/lemon.ts';
import type { Memo } from '../../../shared/memos.ts';
import type { TimelineEntry } from '../../../shared/timeline.ts';
import type { DailyWeather } from '../../../shared/weather.ts';
import { nameOf } from './people.ts';
import { toRef } from './refs.ts';
import { jstDateTime, whenOutput } from './time.ts';
import { compact, type Person } from './types.ts';

/**
 * タイムラインのエントリーを LLM に返す形にする。どの種類も `ref`（書くツールに渡す）と `type` を先頭に持ち、
 * 人は名前、日時は JST で出し、値の無い項目は省く（`compact`）。
 * DB の列や API の形（UTC の日時、排他的な終端、ユーザー ID）は出さない。
 */

/** 予定・タスクのうち、出力に使う所。一覧の項目（回ごと・日ごと）も、書き込みが返した行も渡せる */
type EventLike = EventMaster &
  Partial<Pick<Extract<CalendarItem, { kind: 'event' }>, 'dayIndex' | 'dayCount'>> & {
    occurrenceStart?: string | null;
    isOverdue?: boolean;
  };

export function formatEvent(item: EventLike, people: Person[]) {
  const { allDay, startsAt, endsAt } = item;
  const ref = toRef(item.kind, item.id, item.occurrenceStart);
  const start = startsAt && whenOutput(allDay, startsAt, 'start');
  const end = endsAt && whenOutput(allDay, endsAt, 'end');
  const details = {
    participants: item.participantIds.map((id) => nameOf(people, id)),
    location: item.location,
    note: item.note,
    repeat: item.rrule,
    remindBeforeStart: item.remindStartMinutes,
  };
  if (item.kind === 'event') {
    const { dayIndex, dayCount } = item;
    return {
      ref,
      type: 'event' as const,
      title: item.title,
      ...compact({
        start,
        end,
        allDay: allDay || undefined,
        day: dayCount && dayCount > 1 ? `${dayIndex}/${dayCount}` : undefined,
        ...details,
        remindBeforeEnd: item.remindEndMinutes,
      }),
    };
  }
  return {
    ref,
    type: 'task' as const,
    title: item.title,
    done: item.completedAt !== null,
    ...compact({
      doneAt: item.completedAt && jstDateTime(item.completedAt),
      start,
      due: end,
      overdue: item.isOverdue || undefined,
      ...details,
      remindBeforeDue: item.remindEndMinutes,
    }),
  };
}

/** 立替。paidFor の "shared" は 2 人の共有（折半） */
export function formatExpense(expense: Expense, people: Person[]) {
  return {
    ref: toRef('expense', expense.id),
    type: 'expense' as const,
    date: expense.spentOn,
    amount: expense.amount,
    description: expense.description,
    paidBy: nameOf(people, expense.fromUserId),
    paidFor: expense.toUserId === null ? 'shared' : nameOf(people, expense.toUserId),
  };
}

/** 立替の残高。payer が payee に amount 円を払えば精算される */
export function formatBalance(balance: Balance, people: Person[]) {
  if (balance.fromUserId === null) return { settled: true, amount: 0 };
  return {
    settled: false,
    amount: balance.amount,
    payer: nameOf(people, balance.fromUserId),
    payee: nameOf(people, balance.toUserId),
  };
}

export function formatCareLog(log: CareLog, people: Person[]) {
  return {
    ref: toRef('lemon', log.id),
    type: 'lemon' as const,
    at: jstDateTime(log.doneAt),
    careTypes: log.careTypes,
    ...compact({ note: log.note }),
    by: log.createdBy ? nameOf(people, log.createdBy) : `API キー「${log.apiKeyName}」`,
  };
}

export function formatMemo(memo: Memo, people: Person[]) {
  return {
    ref: toRef('memo', memo.id),
    type: 'memo' as const,
    at: jstDateTime(memo.createdAt),
    body: memo.body,
    by: memo.createdBy ? nameOf(people, memo.createdBy) : '',
  };
}

export type FormattedEntry = ReturnType<
  typeof formatEvent | typeof formatExpense | typeof formatCareLog | typeof formatMemo
>;

export function formatEntry(entry: TimelineEntry, people: Person[]): FormattedEntry {
  switch (entry.type) {
    case 'event':
      return formatEvent(entry.item, people);
    case 'expense':
      return formatExpense(entry.expense, people);
    case 'lemon':
      return formatCareLog(entry.log, people);
    case 'memo':
      return formatMemo(entry.memo, people);
  }
}

/** 日ごとの天気の要約（タイムラインの日と天気のツールで同じ名前にする） */
export function weatherSummary(day: DailyWeather) {
  return compact({
    summary: day.label,
    tempMax: day.tempMax,
    tempMin: day.tempMin,
    rainChance: day.pop,
  });
}
