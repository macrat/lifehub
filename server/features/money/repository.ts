import { and, gte, lte, notInArray, sql } from 'drizzle-orm';
import type { DateRange } from '../../../shared/date.ts';
import type { ExpenseFilter } from '../../../shared/validation/expenses.ts';
import { db, runBatch } from '../../lib/db/client.ts';
import { historyQueries } from '../../lib/db/history.ts';
import { containsKeyword, startOfDateSql } from '../../lib/db/query.ts';
import { timelineQueries } from '../../lib/db/timeline.ts';
import {
  type MoneyAccountRow,
  type MoneyTransactionRow,
  moneyAccounts,
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
                description: sql`excluded.description`,
                amount: sql`excluded.amount`,
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

/**
 * お金の画面の一覧に並べる問い合わせ（`historyQueries`）。絞り込みは立替の一覧と同じ条件を入出金に読み替える:
 * - キーワード: 内容の部分一致
 * - 金額の範囲: 出金も入金も額の大きさ（絶対値）で比べる（立替の金額と同じく「いくら動いたか」）
 * - 日付の範囲: 明細の日付。範囲は両端を含む
 * - To・From: 入出金は当事者を持たないので、どちらかで絞り込んでいれば出さない
 */
export function history(filter: ExpenseFilter) {
  const amount = sql`abs(${moneyTransactions.amount})`;
  return historyQueries({
    table: moneyTransactions,
    day: moneyTransactions.occurredOn,
    conditions: [
      keywordCondition(filter.q),
      filter.min !== undefined ? gte(amount, filter.min) : undefined,
      filter.max !== undefined ? lte(amount, filter.max) : undefined,
      filter.since !== undefined ? gte(moneyTransactions.occurredOn, filter.since) : undefined,
      filter.until !== undefined ? lte(moneyTransactions.occurredOn, filter.until) : undefined,
      filter.to !== undefined || filter.from !== undefined ? sql`false` : undefined,
    ],
  });
}

/** タイムラインの問い合わせ。置く日時は日付の始まり（明細は時刻を持たない。shared/timeline.ts の `transactionEntry` と同じ）。
 * キーワードは内容の部分一致 */
export const timeline = timelineQueries({
  table: moneyTransactions,
  at: startOfDateSql(moneyTransactions.occurredOn).mapWith(moneyTransactions.createdAt),
  keyword: keywordCondition,
});
