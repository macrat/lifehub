import { and, asc, gte, isNotNull, lt, lte, notInArray, sql } from 'drizzle-orm';
import type { DateRange } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import type { MoneyRule } from '../../../shared/validation/money.ts';
import { db, runBatch } from '../../lib/db/client.ts';
import type { Rewritten } from './rules.ts';
import {
  type MoneyAccountRow,
  type MoneyBalanceRow,
  type MoneyRuleRow,
  moneyAccounts,
  moneyBalances,
  moneyRecords,
  moneyRules,
} from './schema.ts';

/**
 * Money Forward の取り込みの DB アクセス: 口座の値と日ごとの記録、取り込んだ入出金、取り込みルール。
 * 手で入れた立替と立替スケジュールは `repository.ts`。
 */

/** 取り込んだ入出金だけの条件（取り込みとルールが書くのはこれだけ。手で入れた立替には触らない） */
const imported = isNotNull(moneyRecords.account);

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
