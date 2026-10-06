import { and, eq, gte, inArray, lte, notInArray, or, type SQL, sql } from 'drizzle-orm';
import { TIME_ZONE } from '../../../shared/constants.ts';
import type { DateString } from '../../../shared/types.ts';
import type { TransactionFilter, TransactionListQuery } from '../../../shared/validation/money.ts';
import { db, runBatch } from '../../lib/db/client.ts';
import { findHistoryPage } from '../../lib/db/history.ts';
import { containsKeyword } from '../../lib/db/query.ts';
import { timelineQueries } from '../../lib/db/timeline.ts';
import {
  type MoneyAccountRow,
  type MoneyTransactionRow,
  moneyAccounts,
  moneyTransactions,
} from './schema.ts';

/** 取り込んだ明細 1 件の値（行の id と監査列は含まない） */
export type TransactionValues = Omit<MoneyTransactionRow, 'id' | 'createdAt' | 'updatedAt'>;

/** 口座の名前ごとの今の値 */
export async function findAccounts(names: string[]): Promise<MoneyAccountRow[]> {
  if (names.length === 0) return [];
  return db.select().from(moneyAccounts).where(inArray(moneyAccounts.name, names));
}

/** 口座の値を上書きする（行が無ければ作る） */
export async function upsertAccounts(rows: MoneyAccountRow[]): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(moneyAccounts)
    .values(rows)
    .onConflictDoUpdate({
      target: moneyAccounts.name,
      set: {
        balance: sql`excluded.balance`,
        withdrawalAmount: sql`excluded.withdrawal_amount`,
        withdrawalOn: sql`excluded.withdrawal_on`,
        fetchedAt: sql`excluded.fetched_at`,
      },
    });
}

/**
 * accounts の [from, to]（両端を含む）の明細を、取り込んだ rows に置き換える。
 * 同じ明細（`source_id`）は上書きし（行の id は変えない）、rows に無い明細は Money Forward で消されたものとして消す。
 * 1 つのトランザクションで書くので、途中で失敗しても前の明細が残る（`runBatch`）。
 * rows の id は新しく作るときだけ使う。
 */
export async function replaceInRange(
  accounts: string[],
  range: { from: DateString; to: DateString },
  rows: (TransactionValues & { id: string })[],
): Promise<void> {
  if (accounts.length === 0) return;
  const inRange = and(
    inArray(moneyTransactions.account, accounts),
    gte(moneyTransactions.occurredOn, range.from),
    lte(moneyTransactions.occurredOn, range.to),
  );
  const sourceIds = rows.map((row) => row.sourceId);
  await runBatch((tx) => [
    tx
      .delete(moneyTransactions)
      .where(
        sourceIds.length > 0
          ? and(inRange, notInArray(moneyTransactions.sourceId, sourceIds))
          : inRange,
      ),
    ...(rows.length > 0
      ? [
          tx
            .insert(moneyTransactions)
            .values(rows)
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
  ]);
}

/** キーワードの条件: 内容か分類の部分一致 */
function keywordCondition(q: string | undefined): SQL | undefined {
  const description = containsKeyword(moneyTransactions.description, q);
  return description && or(description, containsKeyword(moneyTransactions.category, q));
}

/** 絞り込みの条件。範囲は両端を含む。accounts は今取り込んでいる口座（外した口座の明細は出さない） */
function filterConditions(f: TransactionFilter, accounts: string[]): (SQL | undefined)[] {
  return [
    inArray(moneyTransactions.account, accounts),
    keywordCondition(f.q),
    f.since !== undefined ? gte(moneyTransactions.occurredOn, f.since) : undefined,
    f.until !== undefined ? lte(moneyTransactions.occurredOn, f.until) : undefined,
    f.account !== undefined ? eq(moneyTransactions.account, f.account) : undefined,
  ];
}

/** 履歴の 1 ページ（`findHistoryPage`）。日は明細の日付 */
export function findPage({ before, ...filter }: TransactionListQuery, accounts: string[]) {
  return findHistoryPage({
    table: moneyTransactions,
    day: moneyTransactions.occurredOn,
    order: [moneyTransactions.id],
    conditions: filterConditions(filter, accounts),
    before,
  });
}

/** タイムラインで明細を置く日時: 日付の始まり（明細は時刻を持たない。shared/timeline.ts の `transactionEntry` と同じ） */
const timelineAt =
  sql<Date>`${moneyTransactions.occurredOn}::timestamp at time zone ${TIME_ZONE}`.mapWith(
    moneyTransactions.createdAt,
  );

/** タイムラインの問い合わせ。キーワードは内容か分類の部分一致。accounts は今取り込んでいる口座 */
export function timeline(accounts: string[]) {
  return timelineQueries({
    table: moneyTransactions,
    at: timelineAt,
    keyword: keywordCondition,
    where: inArray(moneyTransactions.account, accounts),
  });
}
