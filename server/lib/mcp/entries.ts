import type { CalendarItem, EventMaster } from '../../../shared/calendar.ts';
import type { CareLog } from '../../../shared/lemon.ts';
import type { Memo } from '../../../shared/memos.ts';
import {
  hasParties,
  type MoneyAccount,
  type MoneyRecord,
  type Settlement,
} from '../../../shared/money.ts';
import type { TimelineEntry } from '../../../shared/timeline.ts';
import { SHARED } from '../../../shared/validation/money.ts';
import type { DailyWeather } from '../../../shared/weather.ts';
import { actorOf } from '../actor.ts';
import { authorName, nameOf, type Person } from '../people.ts';
import { toRef } from './refs.ts';
import { jstDateTime, whenOutput } from './time.ts';
import { compact } from './types.ts';

/**
 * タイムラインのエントリーを LLM に返す形にする。どの種類も `ref`（書くツールに渡す）と `type` を先頭に持ち、
 * 人は名前、日時は JST で出し、値の無い項目は省く（`compact`）。
 * DB の列や API の形（UTC の日時、排他的な終端、ユーザー ID）は出さない。
 */

/** 予定・タスクのうち、出力に使う所。一覧の項目（回ごと・日ごと）も、書き込みが返した行も渡せる */
type EventLike = EventMaster &
  Partial<Pick<Extract<CalendarItem, { kind: 'event' }>, 'dayIndex' | 'dayCount'>> & {
    occurrenceStart?: string | null;
  };

export function formatEvent(item: EventLike, people: Person[]) {
  const { allDay, startsAt } = item;
  const ref = toRef(item.kind, item.id, item.occurrenceStart);
  const start = whenOutput(allDay, startsAt, 'start');
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
        end: whenOutput(allDay, item.endsAt, 'end'),
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
      ...details,
    }),
  };
}

/** 立替の当事者の名前。null は共有（共有口座）で "shared" */
function partyName(people: Person[], id: string | null): string {
  return id === null ? SHARED : nameOf(people, id);
}

/**
 * お金の記録。paidBy・paidFor の "shared" は共有口座。
 * 手で入れた立替は ref を持つ（update_expense・delete_entry で直せる）。Money Forward から取り込んだ入出金は
 * account（金融機関）を持ち、amount は入金が正・出金が負で、読むだけなので ref を持たない。取り込みルールで
 * 「共有」との立替にしたものだけが paidBy・paidFor を持つ（精算に入っている）
 */
export function formatExpense(expense: MoneyRecord, people: Person[]) {
  return {
    ...(expense.account === null ? { ref: toRef('expense', expense.id) } : {}),
    type: 'expense' as const,
    date: expense.occurredOn,
    ...compact({ account: expense.account }),
    amount: expense.amount,
    description: expense.description,
    ...(hasParties(expense) && {
      paidBy: partyName(people, expense.fromUserId),
      paidFor: partyName(people, expense.toUserId),
    }),
  };
}

/** 立替を帳消しにする資金移動。payer が payee に amount 円を払う。空の配列なら精算済み */
export function formatSettlements(settlements: Settlement[], people: Person[]) {
  return settlements.map((s) => ({
    payer: partyName(people, s.debtorId),
    payee: partyName(people, s.creditorId),
    amount: s.amount,
  }));
}

export function formatCareLog(log: CareLog, people: Person[]) {
  return {
    ref: toRef('lemon', log.id),
    type: 'lemon' as const,
    at: jstDateTime(log.doneAt),
    careTypes: log.careTypes,
    ...compact({ note: log.note }),
    by: authorName(people, actorOf(log)),
  };
}

/** via は MCP で書いたメモの、書いた MCP クライアントの名前（画面で書いたメモは省く） */
export function formatMemo(memo: Memo, people: Person[]) {
  return {
    ref: toRef('memo', memo.id),
    type: 'memo' as const,
    at: jstDateTime(memo.createdAt),
    body: memo.body,
    by: memo.createdBy ? nameOf(people, memo.createdBy) : '',
    ...compact({ via: memo.mcpClientName }),
  };
}

/**
 * 口座の今の値。銀行は残高（balance）と 30 日前からの差（balanceChange）、証券は評価額（balance）と差（balanceChange）、
 * クレジットカードは次回の引き落とし（withdrawalAmount・withdrawalOn）。読めていない値は省く
 */
export function formatMoneyAccount(account: MoneyAccount) {
  return {
    name: account.name,
    kind: account.kind,
    ...compact({
      balance: account.balance,
      balanceChange: account.balanceChange,
      withdrawalAmount: account.withdrawalAmount,
      withdrawalOn: account.withdrawalOn,
      fetchedAt: account.fetchedAt && jstDateTime(account.fetchedAt),
    }),
  };
}

/**
 * エントリーの出力（タイムライン。MCP Events もこの形で知らせる）。書き換え・消せるエントリーは ref を持つ
 * （取り込んだ入出金は読むだけで持たない）
 */
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
