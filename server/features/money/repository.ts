import { and, asc, eq, gte, isNotNull, lte, notInArray, type SQL, sql } from 'drizzle-orm';
import type { DateRange } from '../../../shared/date.ts';
import type { ExpenseTotal } from '../../../shared/expenses.ts';
import { type ExpenseFilter, SHARED } from '../../../shared/validation/expenses.ts';
import type { MoneyRule } from '../../../shared/validation/money.ts';
import { db, runBatch } from '../../lib/db/client.ts';
import { historyQueries } from '../../lib/db/history.ts';
import { containsKeyword, startOfDateSql } from '../../lib/db/query.ts';
import { timelineQueries } from '../../lib/db/timeline.ts';
import type { Rewritten } from './rules.ts';
import {
  type MoneyAccountRow,
  type MoneyRuleRow,
  type MoneyTransactionRow,
  moneyAccounts,
  moneyRules,
  moneyTransactions,
} from './schema.ts';

/** 取り込んだ明細 1 件の値（行の id と監査列は含まない） */
export type TransactionValues = Omit<MoneyTransactionRow, 'id' | 'createdAt' | 'updatedAt'>;

/** 口座の今の値（取り込んでいる口座の分だけ。外した口座の行は取り込みで消す） */
export async function findAccounts(): Promise<MoneyAccountRow[]> {
  return db.select().from(moneyAccounts);
}

/**
 * 取り込んだものを書く。1 つのトランザクションで書くので、途中で失敗しても前の値が残る（`runBatch`）。
 * - accounts（今取り込む口座）に無い口座の行と明細を消す（環境変数から外した口座は、次の取り込みで消える）
 * - range（両端を含む）の明細を transactions に置き換える。同じ明細（`source_id`）は上書きし（行の id は変えない）、
 *   transactions に無い明細は Money Forward で消されたものとして消す。transactions の id は新しく作るときだけ使う。
 *   明細を 1 つも読めなければ range は null で、明細には触らない（置き換える範囲は読んだ明細の日付で決めるため）
 * - 口座の値を上書きする（行が無ければ作る）
 */
export async function saveImport({
  accounts,
  range,
  transactions,
  accountRows,
}: {
  accounts: string[];
  range: DateRange | null;
  transactions: (TransactionValues & { id: string })[];
  accountRows: MoneyAccountRow[];
}): Promise<void> {
  await runBatch((tx) => [
    tx.delete(moneyTransactions).where(notInArray(moneyTransactions.account, accounts)),
    tx.delete(moneyAccounts).where(notInArray(moneyAccounts.name, accounts)),
    ...(range
      ? [
          tx.delete(moneyTransactions).where(
            and(
              gte(moneyTransactions.occurredOn, range.from),
              lte(moneyTransactions.occurredOn, range.to),
              notInArray(
                moneyTransactions.sourceId,
                transactions.map((row) => row.sourceId),
              ),
            ),
          ),
          tx
            .insert(moneyTransactions)
            .values(transactions)
            .onConflictDoUpdate({
              target: moneyTransactions.sourceId,
              set: {
                account: sql`excluded.account`,
                occurredOn: sql`excluded.occurred_on`,
                originalDescription: sql`excluded.original_description`,
                description: sql`excluded.description`,
                amount: sql`excluded.amount`,
                direction: sql`excluded.direction`,
                userId: sql`excluded.user_id`,
                hidden: sql`excluded.hidden`,
                updatedAt: new Date(),
              },
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
  ]);
}

/** キーワードの条件: 内容の部分一致 */
const keywordCondition = (q: string | undefined) =>
  containsKeyword(moneyTransactions.description, q);

/** ルールで一覧に出さないとした入出金を除く条件（お金の画面の一覧とタイムライン。精算の合計には掛けない） */
const shown = eq(moneyTransactions.hidden, false);

/**
 * お金の画面の一覧に並べる問い合わせ（`historyQueries`）。ルールで一覧に出さないとした入出金は出さない。絞り込みは立替の一覧と同じ条件を入出金に読み替える:
 * - キーワード: 内容の部分一致
 * - 金額の範囲: 出金も入金も額の大きさ（絶対値）で比べる（立替の金額と同じく「いくら動いたか」）
 * - 日付の範囲: 明細の日付。範囲は両端を含む
 * - To・From: ルールで「共有」との立替にした入出金だけが当事者を持つ（入金は 対象者 → 共有、出金は 共有 → 対象者）。
 *   ただの支出は当事者を持たないので、どちらかで絞り込んでいれば出さない
 */
export function history(filter: ExpenseFilter) {
  const amount = sql`abs(${moneyTransactions.amount})`;
  return historyQueries({
    table: moneyTransactions,
    day: moneyTransactions.occurredOn,
    conditions: [
      shown,
      keywordCondition(filter.q),
      filter.min !== undefined ? gte(amount, filter.min) : undefined,
      filter.max !== undefined ? lte(amount, filter.max) : undefined,
      filter.since !== undefined ? gte(moneyTransactions.occurredOn, filter.since) : undefined,
      filter.until !== undefined ? lte(moneyTransactions.occurredOn, filter.until) : undefined,
      partyCondition('to', filter.to),
      partyCondition('from', filter.from),
    ],
  });
}

/**
 * To・From の絞り込みを入出金の向きと対象者に読み替える。共有は、To なら入金（共有口座へ入れた）、From なら出金。
 * 人は、To なら出金（その人が引き出した）、From なら入金（その人が入れた）
 */
function partyCondition(side: 'to' | 'from', party: string | undefined): SQL | undefined {
  if (party === undefined) return undefined;
  const sharedSide = side === 'to' ? 'deposit' : 'withdrawal';
  if (party === SHARED) return eq(moneyTransactions.direction, sharedSide);
  const personSide = side === 'to' ? 'withdrawal' : 'deposit';
  return and(eq(moneyTransactions.direction, personSide), eq(moneyTransactions.userId, party));
}

/**
 * ルールで「共有」との立替にした入出金の、向きと対象者ごとの合計（立替の `sumByDirection` と同じ形。精算に足す）。
 * 額は出金も入金も大きさ（絶対値）
 */
export async function sumTransfers(): Promise<ExpenseTotal[]> {
  const rows = await db
    .select({
      direction: moneyTransactions.direction,
      userId: moneyTransactions.userId,
      amount: sql<number>`sum(abs(${moneyTransactions.amount}))::int`,
    })
    .from(moneyTransactions)
    .where(isNotNull(moneyTransactions.direction))
    .groupBy(moneyTransactions.direction, moneyTransactions.userId);
  return rows.map(({ direction, userId, amount }) =>
    direction === 'deposit'
      ? { fromUserId: userId, toUserId: null, amount }
      : { fromUserId: null, toUserId: userId, amount },
  );
}

/** ルールの並び（上から順） */
export async function findRules(): Promise<MoneyRuleRow[]> {
  return db.select().from(moneyRules).orderBy(asc(moneyRules.position));
}

/** 読み替え直すための、すべての入出金の元の内容欄 */
export async function findOriginals(): Promise<{ id: string; originalDescription: string }[]> {
  return db
    .select({
      id: moneyTransactions.id,
      originalDescription: moneyTransactions.originalDescription,
    })
    .from(moneyTransactions);
}

/**
 * ルールの並びを rules に置き換え、入出金を読み替え直した値（rewritten。id ごと）で上書きする。
 * 1 つのトランザクションで書くので、ルールと入出金の読み替えが食い違ったまま残らない（`runBatch`）。
 * 読み替えは 1 つの update にまとめる（入出金の数だけ往復しない）
 */
export async function replaceRules(
  rules: MoneyRule[],
  createdBy: string,
  rewritten: (Rewritten & { id: string })[],
): Promise<void> {
  const values = rewritten.map(
    (row) =>
      sql`(${row.id}::uuid, ${row.description}, ${row.direction}, ${row.userId}::uuid, ${row.hidden}::boolean)`,
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
            .update(moneyTransactions)
            .set({
              description: sql`v.description`,
              direction: sql`v.direction`,
              userId: sql`v.user_id`,
              hidden: sql`v.hidden`,
            })
            .from(
              sql`(values ${sql.join(values, sql`, `)}) as v(id, description, direction, user_id, hidden)`,
            )
            .where(sql`${moneyTransactions.id} = v.id`),
        ]
      : []),
  ]);
}

/** タイムラインの問い合わせ。置く日時は日付の始まり（明細は時刻を持たない。shared/timeline.ts の `transactionEntry` と同じ）。
 * キーワードは内容の部分一致。ルールで一覧に出さないとした入出金は出さない */
export const timeline = timelineQueries({
  table: moneyTransactions,
  at: startOfDateSql(moneyTransactions.occurredOn).mapWith(moneyTransactions.createdAt),
  keyword: keywordCondition,
  where: shown,
});
