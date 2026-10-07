import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  notInArray,
  type SQL,
  sql,
} from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { TIME_ZONE } from '../../../shared/constants.ts';
import type { DateRange } from '../../../shared/date.ts';
import type { ExpenseTotal } from '../../../shared/money.ts';
import type { DateString } from '../../../shared/types.ts';
import {
  type ExpenseInput,
  type ExpenseScheduleInput,
  type MoneyFilter,
  type MoneyListQuery,
  type MoneyRule,
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
import type { Rewritten } from './rules.ts';
import {
  type MoneyAccountRow,
  type MoneyBalanceRow,
  type MoneyRecordRow,
  type MoneyRuleRow,
  type MoneyScheduleRow,
  moneyAccounts,
  moneyBalances,
  moneyRecords,
  moneyRules,
  moneySchedules,
} from './schema.ts';

/** 手で入れた立替だけの条件（直せる・消せるのはこれだけ。取り込んだ入出金は取り込みとルールだけが書く） */
const manual = isNull(moneyRecords.account);

/** 取り込んだ入出金だけの条件（取り込みとルールが書くのはこれだけ。手で入れた立替には触らない） */
const imported = isNotNull(moneyRecords.account);

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
  const [updated] = await db
    .update(moneyRecords)
    .set(row)
    .where(and(eq(moneyRecords.id, id), manual))
    .returning();
  return updated;
}

/** 手で入れた立替を消し、消した行を返す（無いか、取り込んだ入出金なら undefined） */
export async function remove(id: string): Promise<MoneyRecordRow | undefined> {
  const [deleted] = await db
    .delete(moneyRecords)
    .where(and(eq(moneyRecords.id, id), manual))
    .returning();
  return deleted;
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

/** 記録する立替の insert（無ければ文を出さない。空の values は SQL にならない） */
function insertExpenses(tx: Database, due: NewExpense[]) {
  return due.length > 0 ? [tx.insert(moneyRecords).values(due).returning()] : [];
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

/** 口座の今の値（取り込んでいる口座の分だけ。外した口座の行は取り込みで消す） */
export async function findAccounts(): Promise<MoneyAccountRow[]> {
  return db.select().from(moneyAccounts);
}

/** 取り込んだ明細 1 件（ルールで読み替えた後の値も持つ） */
export type ImportedRecord = Rewritten & {
  id: string;
  sourceId: string;
  account: string;
  occurredOn: DateString;
  originalDescription: string;
  amount: number;
};

/**
 * 取り込んだものを書く。1 つのトランザクションで書くので、途中で失敗しても前の値が残る（`runBatch`）。
 * 明細を書くのは取り込んだ入出金の行だけ（`imported`。手で入れた立替には触らない）。
 * - accounts（今取り込む口座）に無い口座の行と明細を消す（環境変数から外した口座は、次の取り込みで消える）
 * - range（両端を含む）の明細を records に置き換える。同じ明細（`source_id`）は変わっていれば上書きし（行の id は変えない）、
 *   records に無い明細は Money Forward で消されたものとして消す。records の id は新しく作るときだけ使う。
 *   明細を 1 つも読めなければ range は null で、明細には触らない（置き換える範囲は読んだ明細の日付で決めるため）
 * - 口座の値を上書きする（行が無ければ作る）
 * - 口座の値の日ごとの記録（balanceRows）を足す。同じ口座・同じ日の行は上書きする
 */
export async function saveImport({
  accounts,
  range,
  records,
  accountRows,
  balanceRows,
}: {
  accounts: string[];
  range: DateRange | null;
  records: ImportedRecord[];
  accountRows: MoneyAccountRow[];
  balanceRows: MoneyBalanceRow[];
}): Promise<void> {
  await runBatch((tx) => [
    tx.delete(moneyRecords).where(and(imported, notInArray(moneyRecords.account, accounts))),
    tx.delete(moneyAccounts).where(notInArray(moneyAccounts.name, accounts)),
    tx.delete(moneyBalances).where(notInArray(moneyBalances.account, accounts)),
    ...(range
      ? [
          tx.delete(moneyRecords).where(
            and(
              imported,
              gte(moneyRecords.occurredOn, range.from),
              lte(moneyRecords.occurredOn, range.to),
              notInArray(
                moneyRecords.sourceId,
                records.map((row) => row.sourceId),
              ),
            ),
          ),
          tx
            .insert(moneyRecords)
            .values(records)
            .onConflictDoUpdate({
              target: moneyRecords.sourceId,
              set: {
                account: sql`excluded.account`,
                occurredOn: sql`excluded.occurred_on`,
                originalDescription: sql`excluded.original_description`,
                description: sql`excluded.description`,
                amount: sql`excluded.amount`,
                fromUserId: sql`excluded.from_user_id`,
                toUserId: sql`excluded.to_user_id`,
                hidden: sql`excluded.hidden`,
                updatedAt: new Date(),
              },
              // 変わっていない明細は書かない（毎日 2 か月分を読み直すので、ほとんどの明細は前と同じ）
              setWhere: sql`(${moneyRecords.account}, ${moneyRecords.occurredOn}, ${moneyRecords.originalDescription}, ${moneyRecords.description}, ${moneyRecords.amount}, ${moneyRecords.fromUserId}, ${moneyRecords.toUserId}, ${moneyRecords.hidden}) is distinct from (excluded.account, excluded.occurred_on, excluded.original_description, excluded.description, excluded.amount, excluded.from_user_id, excluded.to_user_id, excluded.hidden)`,
            }),
        ]
      : []),
    tx
      .insert(moneyAccounts)
      .values(accountRows)
      .onConflictDoUpdate({
        target: moneyAccounts.name,
        set: {
          balance: sql`excluded.balance`,
          withdrawalAmount: sql`excluded.withdrawal_amount`,
          withdrawalOn: sql`excluded.withdrawal_on`,
          fetchedAt: sql`excluded.fetched_at`,
        },
      }),
    ...(balanceRows.length > 0
      ? [
          tx
            .insert(moneyBalances)
            .values(balanceRows)
            .onConflictDoUpdate({
              target: [moneyBalances.account, moneyBalances.recordedOn],
              set: { balance: sql`excluded.balance` },
            }),
        ]
      : []),
  ]);
}

/**
 * 口座の値の記録のうち [from, before) の日の行と、from より前の記録がまだあるか。
 * 2 つは同じ時点に投げる（往復を増やさない）
 */
export async function findBalances(
  from: DateString,
  before: DateString,
): Promise<{ rows: MoneyBalanceRow[]; hasOlder: boolean }> {
  const [rows, older] = await Promise.all([
    db
      .select()
      .from(moneyBalances)
      .where(and(gte(moneyBalances.recordedOn, from), lt(moneyBalances.recordedOn, before))),
    db
      .select({ one: sql`1` })
      .from(moneyBalances)
      .where(lt(moneyBalances.recordedOn, from))
      .limit(1),
  ]);
  return { rows, hasOlder: older.length > 0 };
}

/** ルールの並び（上から順） */
export async function findRules(): Promise<MoneyRuleRow[]> {
  return db.select().from(moneyRules).orderBy(asc(moneyRules.position));
}

/** 読み替え直すための、取り込んだすべての入出金の元の内容欄と、今の読み替え（変わった行だけを書くため） */
export async function findRewritten(): Promise<
  (Rewritten & { id: string; originalDescription: string })[]
> {
  return db
    .select({
      id: moneyRecords.id,
      // 取り込んだ入出金は元の内容欄を必ず持つ（`money_records_import_check`）
      originalDescription: sql<string>`${moneyRecords.originalDescription}`,
      description: moneyRecords.description,
      fromUserId: moneyRecords.fromUserId,
      toUserId: moneyRecords.toUserId,
      hidden: moneyRecords.hidden,
    })
    .from(moneyRecords)
    .where(imported);
}

/**
 * ルールの並びを rules に置き換え、読み替えが変わった入出金を読み替え直した値（rewritten。id ごと）で上書きする。
 * 1 つのトランザクションで書くので、ルールと入出金の読み替えが食い違ったまま残らない（`runBatch`）。
 * 読み替えは 1 つの update にまとめる（入出金の数だけ往復しない）。書くのは取り込んだ入出金だけ（`imported`）
 */
export async function replaceRules(
  rules: MoneyRule[],
  createdBy: string,
  rewritten: (Rewritten & { id: string })[],
): Promise<void> {
  const values = rewritten.map(
    (row) =>
      sql`(${row.id}::uuid, ${row.description}, ${row.fromUserId}::uuid, ${row.toUserId}::uuid, ${row.hidden}::boolean)`,
  );
  await runBatch((tx) => [
    tx.delete(moneyRules),
    ...(rules.length > 0
      ? [
          tx.insert(moneyRules).values(
            rules.map((rule, position) => ({
              id: rule.id,
              position,
              pattern: rule.pattern,
              replaceDescription: rule.replaceDescription,
              replacement: rule.replacement,
              kind: rule.kind,
              userId: rule.userId,
              hidden: rule.hidden,
              createdBy,
            })),
          ),
        ]
      : []),
    ...(values.length > 0
      ? [
          tx
            .update(moneyRecords)
            .set({
              description: sql`v.description`,
              fromUserId: sql`v.from_user_id`,
              toUserId: sql`v.to_user_id`,
              hidden: sql`v.hidden`,
            })
            .from(
              sql`(values ${sql.join(values, sql`, `)}) as v(id, description, from_user_id, to_user_id, hidden)`,
            )
            .where(and(sql`${moneyRecords.id} = v.id`, imported)),
        ]
      : []),
  ]);
}
