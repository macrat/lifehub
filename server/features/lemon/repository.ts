import { desc, eq } from 'drizzle-orm';
import type { CareType } from '../../../shared/validation/lemon.ts';
import { db } from '../../lib/db.ts';
import { newId } from '../../lib/id.ts';
import { type LemonCareLogRow, lemonCareLogs } from './schema.ts';

export async function findAll(): Promise<LemonCareLogRow[]> {
  return db
    .select()
    .from(lemonCareLogs)
    .orderBy(desc(lemonCareLogs.doneAt), desc(lemonCareLogs.createdAt));
}

export async function insert(row: {
  careType: CareType;
  doneAt: Date;
  note: string | null;
  createdBy: string;
}): Promise<LemonCareLogRow> {
  const inserted = await db
    .insert(lemonCareLogs)
    .values({ ...row, id: newId() })
    .returning();
  const log = inserted[0];
  if (!log) throw new Error('insert returned no row');
  return log;
}

export async function remove(id: string): Promise<boolean> {
  const deleted = await db
    .delete(lemonCareLogs)
    .where(eq(lemonCareLogs.id, id))
    .returning({ id: lemonCareLogs.id });
  return deleted.length > 0;
}
