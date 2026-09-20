import { and, asc, eq, gt, gte, inArray, isNotNull, lt, or } from 'drizzle-orm';
import { db, runBatch } from '../../lib/db.ts';
import { newId } from '../../lib/id.ts';
import {
  type EventOverrideRow,
  type EventRow,
  eventOverrides,
  events,
  type NewEventOverrideRow,
  type NewEventRow,
} from './schema.ts';

export async function findById(id: string): Promise<EventRow | undefined> {
  const rows = await db.select().from(events).where(eq(events.id, id)).limit(1);
  return rows[0];
}

/** [from, to) に発生を持ちうるマスター（繰り返しは開始が to より前なら候補、単発は期間と重なるもの） */
export async function findCandidates(from: Date, to: Date): Promise<EventRow[]> {
  return db
    .select()
    .from(events)
    .where(and(lt(events.startsAt, to), or(isNotNull(events.rrule), gt(events.endsAt, from))))
    .orderBy(asc(events.startsAt));
}

export async function findOverridesByEventIds(eventIds: string[]): Promise<EventOverrideRow[]> {
  if (eventIds.length === 0) return [];
  return db.select().from(eventOverrides).where(inArray(eventOverrides.eventId, eventIds));
}

export async function insert(row: Omit<NewEventRow, 'id'>): Promise<EventRow> {
  const inserted = await db
    .insert(events)
    .values({ ...row, id: newId() })
    .returning();
  const event = inserted[0];
  if (!event) throw new Error('insert returned no row');
  return event;
}

export async function update(
  id: string,
  values: Partial<NewEventRow>,
): Promise<EventRow | undefined> {
  const rows = await db.update(events).set(values).where(eq(events.id, id)).returning();
  return rows[0];
}

export async function remove(id: string): Promise<void> {
  await db.delete(events).where(eq(events.id, id));
}

export async function upsertOverride(row: Omit<NewEventOverrideRow, 'id'>): Promise<void> {
  await db
    .insert(eventOverrides)
    .values({ ...row, id: newId() })
    .onConflictDoUpdate({
      target: [eventOverrides.eventId, eventOverrides.occurrenceStart],
      set: {
        cancelled: row.cancelled,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        title: row.title,
        note: row.note,
        updatedAt: new Date(),
      },
    });
}

export async function deleteOverrides(eventId: string): Promise<void> {
  await db.delete(eventOverrides).where(eq(eventOverrides.eventId, eventId));
}

/**
 * 「これ以降すべて」の分割: 元のマスターを UNTIL 付きに更新し、以降の例外を消し、新しいマスターを作る。
 * 3 文は原子的に実行する（runBatch）。
 */
export async function splitFollowing(input: {
  masterId: string;
  masterRRule: string;
  splitAt: Date;
  newRow: Omit<NewEventRow, 'id'>;
}): Promise<string> {
  const newId_ = newId();
  await runBatch([
    db.update(events).set({ rrule: input.masterRRule }).where(eq(events.id, input.masterId)),
    db
      .delete(eventOverrides)
      .where(
        and(
          eq(eventOverrides.eventId, input.masterId),
          gte(eventOverrides.occurrenceStart, input.splitAt),
        ),
      ),
    db.insert(events).values({ ...input.newRow, id: newId_ }),
  ]);
  return newId_;
}

/** 「これ以降すべて」の削除: 元のマスターを UNTIL 付きに更新し、以降の例外を消す。 */
export async function truncateFollowing(input: {
  masterId: string;
  masterRRule: string;
  splitAt: Date;
}): Promise<void> {
  await runBatch([
    db.update(events).set({ rrule: input.masterRRule }).where(eq(events.id, input.masterId)),
    db
      .delete(eventOverrides)
      .where(
        and(
          eq(eventOverrides.eventId, input.masterId),
          gte(eventOverrides.occurrenceStart, input.splitAt),
        ),
      ),
  ]);
}
