import { desc, eq } from 'drizzle-orm';
import { db } from '../../lib/db.ts';
import { newId } from '../../lib/id.ts';
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
  return db.select().from(expenses).orderBy(desc(expenses.spentOn), desc(expenses.createdAt));
}

export async function insert(row: ExpenseValues & { createdBy: string }): Promise<ExpenseRow> {
  const inserted = await db
    .insert(expenses)
    .values({ ...row, id: newId() })
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
