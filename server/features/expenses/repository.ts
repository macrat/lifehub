import { eq, gte, isNull, lte, type SQL, sql } from 'drizzle-orm';
import { TIME_ZONE } from '../../../shared/constants.ts';
import type { ExpenseTotal } from '../../../shared/expenses.ts';
import type { DateString } from '../../../shared/types.ts';
import {
  type ExpenseFilter,
  type ExpenseListQuery,
  SHARED,
} from '../../../shared/validation/expenses.ts';
import { db } from '../../lib/db/client.ts';
import { findHistoryPage } from '../../lib/db/history.ts';
import { containsKeyword, insertOnce } from '../../lib/db/query.ts';
import { timelineQueries } from '../../lib/db/timeline.ts';
import { type ExpenseRow, expenses } from './schema.ts';

/** 立替そのものの値（id や記録者は含まない） */
type ExpenseValues = {
  fromUserId: string;
  toUserId: string | null;
  amount: number;
  description: string;
  spentOn: DateString;
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
 * タイムラインで立替を置く日時。使った日に記録したものは記録した時刻、後から記録したものはその日の始まり
 * （shared/timeline.ts の `expenseEntry` と同じ式。並べる位置とページの区切りが画面の出す位置と一致する）。
 */
const timelineAt = sql<Date>`case
  when (${expenses.createdAt} at time zone ${TIME_ZONE})::date = ${expenses.spentOn} then ${expenses.createdAt}
  else ${expenses.spentOn}::timestamp at time zone ${TIME_ZONE}
end`.mapWith(expenses.createdAt);

/** タイムラインの問い合わせ。キーワードは内容の部分一致 */
export const timeline = timelineQueries({
  table: expenses,
  at: timelineAt,
  keyword: (q) => containsKeyword(expenses.description, q),
});

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

/** 立替を作る。同じ id で送り直されたら何も書かず、今の行を返す（`insertOnce`） */
export async function insert(
  row: ExpenseValues & { id: string; createdBy: string },
): Promise<ExpenseRow> {
  return insertOnce(expenses, row);
}

export async function findById(id: string): Promise<ExpenseRow | undefined> {
  const rows = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
  return rows[0];
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
