import { asc, eq, sql } from 'drizzle-orm';
import type { ExpenseTotal } from '../../../shared/expenses.ts';
import { db } from '../../lib/db.ts';
import { type ExpenseRow, expenses } from './schema.ts';

/** 立替そのものの値（id や記録者は含まない） */
type ExpenseValues = {
  fromUserId: string;
  toUserId: string | null;
  amount: number;
  description: string;
  spentOn: string;
};

export async function findAll(): Promise<ExpenseRow[]> {
  return db.select().from(expenses).orderBy(asc(expenses.spentOn), asc(expenses.createdAt));
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
