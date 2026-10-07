import { and, asc, eq, gte, inArray, isNull, lt, lte, type SQL, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { TIME_ZONE } from '../../../shared/constants.ts';
import type { ExpenseTotal } from '../../../shared/money.ts';
import type { DateString } from '../../../shared/types.ts';
import {
  type ExpenseInput,
  type ExpenseScheduleInput,
  type MoneyFilter,
  type MoneyListQuery,
  SHARED,
} from '../../../shared/validation/money.ts';
import { type Database, db, runBatch } from '../../lib/db/client.ts';
import { findHistoryPage } from '../../lib/db/history.ts';
import {
  containsKeyword,
  deleteById,
  findById as findRowById,
  insertOnce,
  startOfDateSql,
  updateById,
} from '../../lib/db/query.ts';
import { timelineQueries } from '../../lib/db/timeline.ts';
import {
  type MoneyRecordRow,
  type MoneyScheduleRow,
  moneyRecords,
  moneySchedules,
} from './schema.ts';

/** 手で入れた立替だけの条件（直せる・消せるのはこれだけ。取り込んだ入出金は取り込みとルールだけが書く） */
const manual = isNull(moneyRecords.account);

/** ルールで一覧に出さないとした入出金を除く条件（お金の画面の一覧とタイムライン。精算の合計には掛けない） */
const shown = eq(moneyRecords.hidden, false);

/** 当事者を持つ記録（立替。ただの支出の入出金は持たない） */
const hasParties = sql`num_nonnulls(${moneyRecords.fromUserId}, ${moneyRecords.toUserId}) > 0`;

/** 金額の大きさ（取り込んだ入出金は出金が負なので、絞り込みと精算は大きさで比べる） */
const magnitude = sql`abs(${moneyRecords.amount})`;

/** キーワードの条件: 内容の部分一致（大文字小文字を区別しない） */
const keywordCondition = (q: string | undefined) => containsKeyword(moneyRecords.description, q);

/**
 * お金の画面の一覧の 1 ページ（`findHistoryPage`）。日は記録の日付で、同じ日の中は記録した順
 * （shared/money.ts の `sortMoneyRecords` と同じ）。ルールで一覧に出さないとした入出金は出さない
 */
export function findPage({ before, ...filter }: MoneyListQuery) {
  return findHistoryPage({
    table: moneyRecords,
    day: moneyRecords.occurredOn,
    order: [moneyRecords.createdAt, moneyRecords.id],
    conditions: [shown, ...filterConditions(filter)],
    before,
  });
}

/** 絞り込みの条件。範囲は両端を含む */
function filterConditions(f: MoneyFilter): (SQL | undefined)[] {
  return [
    keywordCondition(f.q),
    f.min !== undefined ? gte(magnitude, f.min) : undefined,
    f.max !== undefined ? lte(magnitude, f.max) : undefined,
    f.since !== undefined ? gte(moneyRecords.occurredOn, f.since) : undefined,
    f.until !== undefined ? lte(moneyRecords.occurredOn, f.until) : undefined,
    partyCondition(moneyRecords.toUserId, f.to),
    partyCondition(moneyRecords.fromUserId, f.from),
  ];
}

/**
 * To・From の絞り込み。SHARED は共有（null）。当事者を持たない記録（ただの支出の入出金）は To も From も null だが、
 * 共有との立替ではないので共有の絞り込みには入れない
 */
function partyCondition(column: AnyPgColumn, party: string | undefined): SQL | undefined {
  if (party === undefined) return undefined;
  return party === SHARED ? and(isNull(column), hasParties) : eq(column, party);
}

/**
 * タイムラインで記録を置く日時。手で入れた立替のうち、その日に記録したものは記録した時刻、それ以外（後から記録した立替と、
 * 取り込んだ入出金）はその日の始まり（shared/timeline.ts の `expenseEntry` と同じ式。並べる位置とページの区切りが
 * 画面の出す位置と一致する）。
 */
const timelineAt = sql<Date>`case
  when ${moneyRecords.account} is null and (${moneyRecords.createdAt} at time zone ${TIME_ZONE})::date = ${moneyRecords.occurredOn} then ${moneyRecords.createdAt}
  else ${startOfDateSql(moneyRecords.occurredOn)}
end`.mapWith(moneyRecords.createdAt);

/** タイムラインの問い合わせ。キーワードは内容の部分一致。ルールで一覧に出さないとした入出金は出さない */
export const timeline = timelineQueries({
  table: moneyRecords,
  at: timelineAt,
  keyword: keywordCondition,
  where: shown,
});

/**
 * 「誰が誰のために払ったか」ごとの合計（額は大きさ）。精算はこれだけで決まるので、行を全部読まずに DB で畳む
 * （当事者はユーザー 2 人と共有なので、返る行は最大 6 つ）。当事者を持たない記録（ただの支出）は入らない
 */
export async function sumByParties(): Promise<ExpenseTotal[]> {
  return db
    .select({
      fromUserId: moneyRecords.fromUserId,
      toUserId: moneyRecords.toUserId,
      amount: sql<number>`sum(${magnitude})::int`,
    })
    .from(moneyRecords)
    .where(hasParties)
    .groupBy(moneyRecords.fromUserId, moneyRecords.toUserId);
}

/** 手で入れる立替 1 件の行（スケジュールが記録する回も同じ） */
export type NewExpense = ExpenseInput & { id: string; createdBy: string };

/** 立替を作る。同じ id で送り直されたら何も書かず、今の行を返す（`insertOnce`） */
export async function insert(row: NewExpense): Promise<MoneyRecordRow> {
  return insertOnce(moneyRecords, row);
}

export async function findById(id: string): Promise<MoneyRecordRow | undefined> {
  return findRowById(moneyRecords, id);
}

/** 手で入れた立替を書き換え、書いた後の行を返す（無いか、取り込んだ入出金なら undefined） */
export async function update(id: string, row: ExpenseInput): Promise<MoneyRecordRow | undefined> {
  return updateById(moneyRecords, id, row, manual);
}

/** 手で入れた立替を消し、消した行を返す（無いか、取り込んだ入出金なら undefined） */
export async function remove(id: string): Promise<MoneyRecordRow | undefined> {
  return deleteById(moneyRecords, id, manual);
}

/** 立替スケジュール（作った順） */
export async function findSchedules(): Promise<MoneyScheduleRow[]> {
  return db.select().from(moneySchedules).orderBy(asc(moneySchedules.createdAt));
}

export async function findScheduleById(id: string): Promise<MoneyScheduleRow | undefined> {
  return findRowById(moneySchedules, id);
}

/** 記録し終えた日が through より前のスケジュール（記録する回が残っているかもしれない物） */
export async function findSchedulesDue(through: DateString): Promise<MoneyScheduleRow[]> {
  return db.select().from(moneySchedules).where(lt(moneySchedules.generatedThrough, through));
}

/** スケジュールを作り、今日までの回（due）を立替として記録する。1 つのトランザクションで書く（`runBatch`） */
export async function insertSchedule(
  row: ExpenseScheduleInput & { id: string; createdBy: string; generatedThrough: DateString },
  due: NewExpense[],
): Promise<MoneyRecordRow[]> {
  const [, rows] = await runBatch((tx) => [
    tx.insert(moneySchedules).values(row),
    ...insertExpenses(tx, due),
  ]);
  return (rows as MoneyRecordRow[] | undefined) ?? [];
}

/**
 * スケジュールの回を記録し、記録し終えた日を through にする（日次の Cron）。1 つのトランザクションで書く（`runBatch`）。
 * 記録する回が無いスケジュールも、記録し終えた日だけは進める
 */
export async function insertDue(
  scheduleIds: string[],
  through: DateString,
  due: NewExpense[],
): Promise<MoneyRecordRow[]> {
  if (scheduleIds.length === 0) return [];
  const [, rows] = await runBatch((tx) => [
    tx
      .update(moneySchedules)
      .set({ generatedThrough: through })
      .where(inArray(moneySchedules.id, scheduleIds)),
    ...insertExpenses(tx, due),
  ]);
  return (rows as MoneyRecordRow[] | undefined) ?? [];
}

/**
 * 記録する立替の insert（無ければ文を出さない。空の values は SQL にならない）。
 * 既に記録した回（同じ ID）は何も書かず、返す行にも入らない（重なった Cron の記録で二重に知らせない）
 */
function insertExpenses(tx: Database, due: NewExpense[]) {
  return due.length > 0
    ? [tx.insert(moneyRecords).values(due).onConflictDoNothing().returning()]
    : [];
}

/** スケジュールを書き換え、書いた後の行を返す（無ければ undefined）。記録し終えた日は変えない（記録した立替はそのまま） */
export async function updateSchedule(
  id: string,
  row: ExpenseScheduleInput,
): Promise<MoneyScheduleRow | undefined> {
  return updateById(moneySchedules, id, row);
}

/** スケジュールを消す。記録した立替は残る */
export async function removeSchedule(id: string): Promise<MoneyScheduleRow | undefined> {
  return deleteById(moneySchedules, id);
}
