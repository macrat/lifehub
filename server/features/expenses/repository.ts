import { and, asc, desc, eq, gte, isNull, lt, lte, type SQL, sql } from 'drizzle-orm';
import type { ExpenseTotal } from '../../../shared/expenses.ts';
import { type ExpenseFilter, SHARED } from '../../../shared/validation/expenses.ts';
import { db } from '../../lib/db.ts';
import { containsKeyword } from '../../lib/history.ts';
import { type ExpenseRow, expenses } from './schema.ts';

/** 立替そのものの値（id や記録者は含まない） */
type ExpenseValues = {
  fromUserId: string;
  toUserId: string | null;
  amount: number;
  description: string;
  spentOn: string;
};

/**
 * before より前（省けば全体）の、新しいほうから limit 件ほどの立替（古い順）。
 * 最も古い日の途中では切らず、その日の立替はすべて入れる（件数は limit より多くなりうる）。
 * 日で切る理由は `HistoryPage`（shared/types.ts）。
 * olderThan は、このページより前にまだ立替があるときの次の境目（このページの最も古い日）。
 */
export async function findPage(
  filter: ExpenseFilter,
  before: string | undefined,
  limit: number,
): Promise<{ rows: ExpenseRow[]; olderThan: string | null }> {
  const conditions = [
    ...filterConditions(filter),
    before !== undefined ? lt(expenses.spentOn, before) : undefined,
  ];
  // 新しいほうから数えて limit 件目の日。ここまでをこのページにする
  const [boundary] = await db
    .select({ spentOn: expenses.spentOn })
    .from(expenses)
    .where(and(...conditions))
    .orderBy(desc(expenses.spentOn), desc(expenses.createdAt))
    .offset(limit - 1)
    .limit(1);
  // このページの行と、それより前がまだあるかは互いに依らないので同時に聞く
  const [rows, older] = await Promise.all([
    db
      .select()
      .from(expenses)
      .where(and(...conditions, boundary && gte(expenses.spentOn, boundary.spentOn)))
      .orderBy(asc(expenses.spentOn), asc(expenses.createdAt), asc(expenses.id)),
    boundary
      ? db
          .select({ id: expenses.id })
          .from(expenses)
          .where(and(...conditions, lt(expenses.spentOn, boundary.spentOn)))
          .limit(1)
      : [],
  ]);
  return { rows, olderThan: boundary && older.length > 0 ? boundary.spentOn : null };
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
