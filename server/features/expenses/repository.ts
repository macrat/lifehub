import { desc, eq } from 'drizzle-orm';
import { db } from '../../lib/db.ts';
import { newId } from '../../lib/id.ts';
import { type ExpenseRow, expenses } from './schema.ts';

export async function findAll(): Promise<ExpenseRow[]> {
  return db.select().from(expenses).orderBy(desc(expenses.spentOn), desc(expenses.createdAt));
}

export async function insert(row: {
  fromUserId: string;
  toUserId: string | null;
  amount: number;
  description: string;
  spentOn: string;
  createdBy: string;
}): Promise<ExpenseRow> {
  const inserted = await db
    .insert(expenses)
    .values({ ...row, id: newId() })
    .returning();
  const expense = inserted[0];
  if (!expense) throw new Error('insert returned no row');
  return expense;
}

export async function remove(id: string): Promise<boolean> {
  const deleted = await db
    .delete(expenses)
    .where(eq(expenses.id, id))
    .returning({ id: expenses.id });
  return deleted.length > 0;
}
