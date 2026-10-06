import { and, eq, gte, lte, notInArray, or, type SQL, sql } from 'drizzle-orm';
import type { DateRange } from '../../../shared/date.ts';
import type { TransactionFilter, TransactionListQuery } from '../../../shared/validation/money.ts';
import { db, runBatch } from '../../lib/db/client.ts';
import { findHistoryPage } from '../../lib/db/history.ts';
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
                category: sql`excluded.category`,
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

/** キーワードの条件: 内容か分類の部分一致 */
function keywordCondition(q: string | undefined): SQL | undefined {
  const description = containsKeyword(moneyTransactions.description, q);
  return description && or(description, containsKeyword(moneyTransactions.category, q));
}

/** 絞り込みの条件。範囲は両端を含む */
function filterConditions(f: TransactionFilter): (SQL | undefined)[] {
  return [
    keywordCondition(f.q),
    f.since !== undefined ? gte(moneyTransactions.occurredOn, f.since) : undefined,
    f.until !== undefined ? lte(moneyTransactions.occurredOn, f.until) : undefined,
    f.account !== undefined ? eq(moneyTransactions.account, f.account) : undefined,
  ];
}

/** 履歴の 1 ページ（`findHistoryPage`）。日は明細の日付 */
export function findPage({ before, ...filter }: TransactionListQuery) {
  return findHistoryPage({
    table: moneyTransactions,
    day: moneyTransactions.occurredOn,
    order: [moneyTransactions.id],
    conditions: filterConditions(filter),
    before,
  });
}

/** タイムラインの問い合わせ。置く日時は日付の始まり（明細は時刻を持たない。shared/timeline.ts の `transactionEntry` と同じ）。
 * キーワードは内容か分類の部分一致 */
export const timeline = timelineQueries({
  table: moneyTransactions,
  at: startOfDateSql(moneyTransactions.occurredOn).mapWith(moneyTransactions.createdAt),
  keyword: keywordCondition,
});
