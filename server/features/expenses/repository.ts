import { asc, eq, gte, inArray, isNull, lt, lte, type SQL, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { TIME_ZONE } from '../../../shared/constants.ts';
import type { ExpenseTotal } from '../../../shared/expenses.ts';
import type { DateString } from '../../../shared/types.ts';
import { type ExpenseFilter, SHARED } from '../../../shared/validation/expenses.ts';
import { type Database, db, runBatch } from '../../lib/db/client.ts';
import { historyQueries } from '../../lib/db/history.ts';
import {
  containsKeyword,
  deleteById,
  findById as findRowById,
  insertOnce,
  startOfDateSql,
  updateById,
} from '../../lib/db/query.ts';
import { timelineQueries } from '../../lib/db/timeline.ts';
import { type ExpenseRow, type ExpenseScheduleRow, expenseSchedules, expenses } from './schema.ts';

/** 立替そのものの値（id や記録者は含まない） */
type ExpenseValues = {
  fromUserId: string | null;
  toUserId: string | null;
  amount: number;
  description: string;
  spentOn: DateString;
};

/** お金の画面の一覧に並べる問い合わせ（`historyQueries`）。日は使った日 */
export function history(filter: ExpenseFilter) {
  return historyQueries({
    table: expenses,
    day: expenses.spentOn,
    conditions: filterConditions(filter),
  });
}

/** 絞り込みの条件。範囲は両端を含む。キーワードは内容の部分一致（大文字小文字を区別しない） */
function filterConditions(f: ExpenseFilter): (SQL | undefined)[] {
  return [
    containsKeyword(expenses.description, f.q),
    f.min !== undefined ? gte(expenses.amount, f.min) : undefined,
    f.max !== undefined ? lte(expenses.amount, f.max) : undefined,
    f.since !== undefined ? gte(expenses.spentOn, f.since) : undefined,
    f.until !== undefined ? lte(expenses.spentOn, f.until) : undefined,
    partyCondition(expenses.toUserId, f.to),
    partyCondition(expenses.fromUserId, f.from),
  ];
}

/** To・From の絞り込み。SHARED は共有（null） */
function partyCondition(column: AnyPgColumn, party: string | undefined): SQL | undefined {
  if (party === undefined) return undefined;
  return party === SHARED ? isNull(column) : eq(column, party);
}

/**
 * タイムラインで立替を置く日時。使った日に記録したものは記録した時刻、後から記録したものはその日の始まり
 * （shared/timeline.ts の `expenseEntry` と同じ式。並べる位置とページの区切りが画面の出す位置と一致する）。
 */
const timelineAt = sql<Date>`case
  when (${expenses.createdAt} at time zone ${TIME_ZONE})::date = ${expenses.spentOn} then ${expenses.createdAt}
  else ${startOfDateSql(expenses.spentOn)}
end`.mapWith(expenses.createdAt);

/** タイムラインの問い合わせ。キーワードは内容の部分一致 */
export const timeline = timelineQueries({
  table: expenses,
  at: timelineAt,
  keyword: (q) => containsKeyword(expenses.description, q),
});

/**
 * 「誰が誰のために払ったか」ごとの合計。精算はこれだけで決まるので、行を全部読まずに DB で畳む
 * （当事者はユーザー 2 人と共有なので、返る行は最大 6 つ）。
 */
export async function sumByDirection(): Promise<ExpenseTotal[]> {
  return db
    .select({
      fromUserId: expenses.fromUserId,
      toUserId: expenses.toUserId,
      amount: sql<number>`sum(${expenses.amount})::int`,
    })
    .from(expenses)
    .groupBy(expenses.fromUserId, expenses.toUserId);
}

/** 立替を作る。同じ id で送り直されたら何も書かず、今の行を返す（`insertOnce`） */
export async function insert(
  row: ExpenseValues & { id: string; createdBy: string },
): Promise<ExpenseRow> {
  return insertOnce(expenses, row);
}

export async function findById(id: string): Promise<ExpenseRow | undefined> {
  return findRowById(expenses, id);
}

export async function update(id: string, row: ExpenseValues): Promise<ExpenseRow | undefined> {
  return updateById(expenses, id, row);
}

/** 消した行（無ければ undefined） */
export async function remove(id: string): Promise<ExpenseRow | undefined> {
  return deleteById(expenses, id);
}

/** 立替スケジュールの値（id・記録し終えた日・監査列は含まない） */
type ScheduleValues = Omit<
  ExpenseScheduleRow,
  'id' | 'generatedThrough' | 'createdAt' | 'updatedAt' | 'createdBy'
>;

/** スケジュールが記録する立替 1 件 */
export type ScheduledExpense = ExpenseValues & { id: string; createdBy: string };

/** 立替スケジュール（作った順） */
export async function findSchedules(): Promise<ExpenseScheduleRow[]> {
  return db.select().from(expenseSchedules).orderBy(asc(expenseSchedules.createdAt));
}

export async function findScheduleById(id: string): Promise<ExpenseScheduleRow | undefined> {
  return findRowById(expenseSchedules, id);
}

/** 記録し終えた日が through より前のスケジュール（記録する回が残っているかもしれない物） */
export async function findSchedulesDue(through: DateString): Promise<ExpenseScheduleRow[]> {
  return db.select().from(expenseSchedules).where(lt(expenseSchedules.generatedThrough, through));
}

/** スケジュールを作り、今日までの回（due）を立替として記録する。1 つのトランザクションで書く（`runBatch`） */
export async function insertSchedule(
  row: ScheduleValues & { id: string; createdBy: string; generatedThrough: DateString },
  due: ScheduledExpense[],
): Promise<ExpenseRow[]> {
  const [, rows] = await runBatch((tx) => [
    tx.insert(expenseSchedules).values(row),
    ...insertExpenses(tx, due),
  ]);
  return (rows as ExpenseRow[] | undefined) ?? [];
}

/**
 * スケジュールの回を記録し、記録し終えた日を through にする（日次の Cron）。1 つのトランザクションで書く（`runBatch`）。
 * 記録する回が無いスケジュールも、記録し終えた日だけは進める
 */
export async function insertDue(
  scheduleIds: string[],
  through: DateString,
  due: ScheduledExpense[],
): Promise<ExpenseRow[]> {
  if (scheduleIds.length === 0) return [];
  const [, rows] = await runBatch((tx) => [
    tx
      .update(expenseSchedules)
      .set({ generatedThrough: through })
      .where(inArray(expenseSchedules.id, scheduleIds)),
    ...insertExpenses(tx, due),
  ]);
  return (rows as ExpenseRow[] | undefined) ?? [];
}

/** 記録する立替の insert（無ければ文を出さない。空の values は SQL にならない） */
function insertExpenses(tx: Database, due: ScheduledExpense[]) {
  return due.length > 0 ? [tx.insert(expenses).values(due).returning()] : [];
}

/** スケジュールを書き換え、書いた後の行を返す（無ければ undefined）。記録し終えた日は変えない（記録した立替はそのまま） */
export async function updateSchedule(
  id: string,
  row: ScheduleValues,
): Promise<ExpenseScheduleRow | undefined> {
  return updateById(expenseSchedules, id, row);
}

/** スケジュールを消す。記録した立替は残る */
export async function removeSchedule(id: string): Promise<ExpenseScheduleRow | undefined> {
  return deleteById(expenseSchedules, id);
}
