import { and, asc, eq, gte, inArray } from 'drizzle-orm';
import { db, runBatch } from '../../lib/db.ts';
import { newId } from '../../lib/id.ts';
import {
  type NewTaskOverrideRow,
  type NewTaskRow,
  type TaskCompletionRow,
  type TaskOverrideRow,
  type TaskRow,
  taskCompletions,
  taskOverrides,
  tasks,
} from './schema.ts';

export async function findById(id: string): Promise<TaskRow | undefined> {
  const rows = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return rows[0];
}

/** 全マスター。表示位置は「今日」に依存し DB で絞れないため、件数の少なさを前提に全件読む。 */
export async function findAll(): Promise<TaskRow[]> {
  return db.select().from(tasks).orderBy(asc(tasks.createdAt));
}

export async function findOverridesByTaskIds(taskIds: string[]): Promise<TaskOverrideRow[]> {
  if (taskIds.length === 0) return [];
  return db.select().from(taskOverrides).where(inArray(taskOverrides.taskId, taskIds));
}

export async function findCompletionsByTaskIds(taskIds: string[]): Promise<TaskCompletionRow[]> {
  if (taskIds.length === 0) return [];
  return db.select().from(taskCompletions).where(inArray(taskCompletions.taskId, taskIds));
}

export async function insert(row: Omit<NewTaskRow, 'id'>): Promise<TaskRow> {
  const inserted = await db
    .insert(tasks)
    .values({ ...row, id: newId() })
    .returning();
  const task = inserted[0];
  if (!task) throw new Error('insert returned no row');
  return task;
}

export async function update(
  id: string,
  values: Partial<NewTaskRow>,
): Promise<TaskRow | undefined> {
  const rows = await db.update(tasks).set(values).where(eq(tasks.id, id)).returning();
  return rows[0];
}

export async function remove(id: string): Promise<void> {
  await db.delete(tasks).where(eq(tasks.id, id));
}

export async function upsertOverride(row: Omit<NewTaskOverrideRow, 'id'>): Promise<void> {
  await db
    .insert(taskOverrides)
    .values({ ...row, id: newId() })
    .onConflictDoUpdate({
      target: [taskOverrides.taskId, taskOverrides.occurrenceKey],
      set: {
        cancelled: row.cancelled,
        title: row.title,
        note: row.note,
        startsAt: row.startsAt,
        dueAt: row.dueAt,
        updatedAt: new Date(),
      },
    });
}

export async function deleteOverrides(taskId: string): Promise<void> {
  await db.delete(taskOverrides).where(eq(taskOverrides.taskId, taskId));
}

export async function upsertCompletion(row: {
  taskId: string;
  occurrenceKey: string;
  completedAt: Date;
  userId: string;
}): Promise<void> {
  await db
    .insert(taskCompletions)
    .values({
      id: newId(),
      taskId: row.taskId,
      occurrenceKey: row.occurrenceKey,
      completedAt: row.completedAt,
      completedBy: row.userId,
      createdBy: row.userId,
    })
    .onConflictDoUpdate({
      target: [taskCompletions.taskId, taskCompletions.occurrenceKey],
      set: { completedAt: row.completedAt, completedBy: row.userId, updatedAt: new Date() },
    });
}

export async function deleteCompletion(taskId: string, occurrenceKey: string): Promise<void> {
  await db
    .delete(taskCompletions)
    .where(
      and(eq(taskCompletions.taskId, taskId), eq(taskCompletions.occurrenceKey, occurrenceKey)),
    );
}

/** 「これ以降すべて」の分割。occurrenceKey は基準日時の ISO なので文字列比較で順序が保たれる。 */
export async function splitFollowing(input: {
  masterId: string;
  masterRRule: string;
  splitKey: string;
  newRow: Omit<NewTaskRow, 'id'>;
}): Promise<string> {
  const id = newId();
  await runBatch([
    db.update(tasks).set({ rrule: input.masterRRule }).where(eq(tasks.id, input.masterId)),
    db
      .delete(taskOverrides)
      .where(
        and(
          eq(taskOverrides.taskId, input.masterId),
          gte(taskOverrides.occurrenceKey, input.splitKey),
        ),
      ),
    db
      .delete(taskCompletions)
      .where(
        and(
          eq(taskCompletions.taskId, input.masterId),
          gte(taskCompletions.occurrenceKey, input.splitKey),
        ),
      ),
    db.insert(tasks).values({ ...input.newRow, id }),
  ]);
  return id;
}

export async function truncateFollowing(input: {
  masterId: string;
  masterRRule: string;
  splitKey: string;
}): Promise<void> {
  await runBatch([
    db.update(tasks).set({ rrule: input.masterRRule }).where(eq(tasks.id, input.masterId)),
    db
      .delete(taskOverrides)
      .where(
        and(
          eq(taskOverrides.taskId, input.masterId),
          gte(taskOverrides.occurrenceKey, input.splitKey),
        ),
      ),
    db
      .delete(taskCompletions)
      .where(
        and(
          eq(taskCompletions.taskId, input.masterId),
          gte(taskCompletions.occurrenceKey, input.splitKey),
        ),
      ),
  ]);
}
