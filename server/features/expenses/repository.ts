import { eq, gte, isNull, lte, type SQL, sql } from 'drizzle-orm';
import type { ExpenseTotal } from '../../../shared/expenses.ts';
import {
  type ExpenseFilter,
  type ExpenseListQuery,
  SHARED,
} from '../../../shared/validation/expenses.ts';
import { db } from '../../lib/db.ts';
import { containsKeyword, findHistoryPage } from '../../lib/history.ts';
import { type ExpenseRow, expenses } from './schema.ts';

/** 立替そのものの値（id や記録者は含まない） */
type ExpenseValues = {
  fromUserId: string;
  toUserId: string | null;
  amount: number;
  description: string;
  spentOn: string;
};

/** 履歴の 1 ページ（`findHistoryPage`）。日は使った日 */
export function findPage({ before, ...filter }: ExpenseListQuery) {
  return findHistoryPage({
    table: expenses,
    day: expenses.spentOn,
    order: [expenses.createdAt, expenses.id],
    conditions: filterConditions(filter),
    before,
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
    f.to === SHARED
      ? isNull(expenses.toUserId)
      : f.to !== undefined
        ? eq(expenses.toUserId, f.to)
        : undefined,
    f.from !== undefined ? eq(expenses.fromUserId, f.from) : undefined,
  ];
}

/**
 * 「誰が誰のために払ったか」ごとの合計。残高はこれだけで決まるので、行を全部読まずに DB で畳む
 * （利用者は 2 人なので、返る行は最大 6 つ）。
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

/**
 * 立替を作る。id は呼び出し元（多くはクライアント）が決めたもの。
 * 同じ id で送り直されたら（オフラインで溜めた書き込みの再送）同じ値を書き直すだけにして、二重に作らない。
 */
export async function insert(
  row: ExpenseValues & { id: string; createdBy: string },
): Promise<ExpenseRow> {
  const inserted = await db
    .insert(expenses)
    .values(row)
    .onConflictDoUpdate({ target: expenses.id, set: row })
    .returning();
  const expense = inserted[0];
  if (!expense) throw new Error('insert returned no row');
  return expense;
}

export async function update(id: string, row: ExpenseValues): Promise<ExpenseRow | undefined> {
  const updated = await db.update(expenses).set(row).where(eq(expenses.id, id)).returning();
  return updated[0];
}

export async function remove(id: string): Promise<boolean> {
  const deleted = await db
    .delete(expenses)
    .where(eq(expenses.id, id))
    .returning({ id: expenses.id });
  return deleted.length > 0;
}
