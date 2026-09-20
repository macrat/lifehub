import { desc, eq } from 'drizzle-orm';
import { db } from '../../lib/db.ts';
import { newId } from '../../lib/id.ts';
import { type ExpenseRow, expenses, type SettlementRow, settlements } from './schema.ts';

export async function findAllExpenses(): Promise<ExpenseRow[]> {
  return db.select().from(expenses).orderBy(desc(expenses.spentOn), desc(expenses.createdAt));
}

export async function findAllSettlements(): Promise<SettlementRow[]> {
  return db
    .select()
    .from(settlements)
    .orderBy(desc(settlements.settledOn), desc(settlements.createdAt));
}

export async function insertExpense(row: {
  paidBy: string;
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

export async function deleteExpense(id: string): Promise<boolean> {
  const deleted = await db
    .delete(expenses)
    .where(eq(expenses.id, id))
    .returning({ id: expenses.id });
  return deleted.length > 0;
}

export async function insertSettlement(row: {
  fromUser: string;
  toUser: string;
  amount: number;
  settledOn: string;
  createdBy: string;
}): Promise<SettlementRow> {
  const inserted = await db
    .insert(settlements)
    .values({ ...row, id: newId() })
    .returning();
  const settlement = inserted[0];
  if (!settlement) throw new Error('insert returned no row');
  return settlement;
}
