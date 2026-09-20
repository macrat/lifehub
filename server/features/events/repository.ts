import { and, eq, gt, gte, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { db, runBatch } from '../../lib/db.ts';
import { newId } from '../../lib/id.ts';
import { type EventRow, eventParticipants, events, type NewEventRow } from './schema.ts';

export type ParticipantRow = { eventId: string; userId: string };

export async function findById(id: string): Promise<EventRow | undefined> {
  const rows = await db.select().from(events).where(eq(events.id, id)).limit(1);
  return rows[0];
}

/**
 * [from, to) に発生を持ちうる繰り返し元・単発の行。
 * 未完了のタスクは表示位置が「今日」に依存し DB で絞れないため全件、予定は期間と重なるもの（繰り返しは開始が to より前なら候補）。
 */
export async function findCandidates(from: Date, to: Date): Promise<EventRow[]> {
  return db
    .select()
    .from(events)
    .where(
      and(
        isNull(events.seriesId),
        or(
          // 完了したタスクは完了日にしか置かれないので、範囲より前に完了したものは読まない
          and(
            eq(events.kind, 'task'),
            or(isNull(events.completedAt), gte(events.completedAt, from)),
          ),
          and(lt(events.startsAt, to), or(isNotNull(events.rrule), gt(events.endsAt, from))),
        ),
      ),
    )
    .orderBy(events.startsAt, events.createdAt);
}

/** 繰り返し元に属する実体化された回 */
export async function findBySeriesIds(seriesIds: string[]): Promise<EventRow[]> {
  if (seriesIds.length === 0) return [];
  return db.select().from(events).where(inArray(events.seriesId, seriesIds));
}

export async function findParticipants(eventIds: string[]): Promise<ParticipantRow[]> {
  if (eventIds.length === 0) return [];
  return db
    .select({ eventId: eventParticipants.eventId, userId: eventParticipants.userId })
    .from(eventParticipants)
    .where(inArray(eventParticipants.eventId, eventIds));
}

function participantRows(eventId: string, userIds: string[]) {
  return userIds.map((userId) => ({ eventId, userId }));
}

/** 行と参加者を原子的に作る。id を返す */
export async function insert(
  row: Omit<NewEventRow, 'id'>,
  participantIds: string[],
): Promise<string> {
  const id = newId();
  await runBatch([
    db.insert(events).values({ ...row, id }),
    db.insert(eventParticipants).values(participantRows(id, participantIds)),
  ]);
  return id;
}

/** 行を更新する。participantIds を渡すと参加者を置き換える */
export async function update(
  id: string,
  values: Partial<NewEventRow>,
  participantIds?: string[],
): Promise<void> {
  if (participantIds === undefined) {
    await db.update(events).set(values).where(eq(events.id, id));
    return;
  }
  await runBatch([
    db.update(events).set(values).where(eq(events.id, id)),
    db.delete(eventParticipants).where(eq(eventParticipants.eventId, id)),
    db.insert(eventParticipants).values(participantRows(id, participantIds)),
  ]);
}

/**
 * 繰り返しの回を実体化する。無ければ row で作り、あれば patch だけを当てる（同じ回への同時操作でも
 * 一意制約違反にならない）。inserted は新しく作ったかどうか（Postgres の xmax = 0 の慣用句）
 */
export async function upsertOccurrence(
  row: Omit<NewEventRow, 'id'>,
  patch: Partial<NewEventRow>,
): Promise<{ id: string; inserted: boolean }> {
  const rows = await db
    .insert(events)
    .values({ ...row, id: newId() })
    .onConflictDoUpdate({
      target: [events.seriesId, events.occurrenceStart],
      set: { ...patch, updatedAt: new Date() },
    })
    .returning({ id: events.id, inserted: sql<boolean>`(xmax = 0)` });
  const result = rows[0];
  if (!result) throw new Error('upsert returned no row');
  return result;
}

export async function setParticipants(eventId: string, userIds: string[]): Promise<void> {
  await runBatch([
    db.delete(eventParticipants).where(eq(eventParticipants.eventId, eventId)),
    db.insert(eventParticipants).values(participantRows(eventId, userIds)),
  ]);
}

export async function remove(id: string): Promise<void> {
  await db.delete(events).where(eq(events.id, id));
}

/** 繰り返し元に属する回のうち、完了していないものを消す（完了した回は履歴として残す） */
export async function deleteUncompletedOccurrences(seriesId: string): Promise<void> {
  await db.delete(events).where(and(eq(events.seriesId, seriesId), isNull(events.completedAt)));
}

/**
 * 「これ以降すべて」の分割: 元の繰り返しを UNTIL 付きに更新し、以降の回を消し、新しい繰り返し元を作る。
 * 全文を原子的に実行する（runBatch）。新しい行の id を返す
 */
export async function splitFollowing(input: {
  masterId: string;
  masterRRule: string;
  splitAt: Date;
  newRow: Omit<NewEventRow, 'id'>;
  participantIds: string[];
}): Promise<string> {
  const id = newId();
  await runBatch([
    db.update(events).set({ rrule: input.masterRRule }).where(eq(events.id, input.masterId)),
    db
      .delete(events)
      .where(and(eq(events.seriesId, input.masterId), gte(events.occurrenceStart, input.splitAt))),
    db.insert(events).values({ ...input.newRow, id }),
    db.insert(eventParticipants).values(participantRows(id, input.participantIds)),
  ]);
  return id;
}

/** 「これ以降すべて」の削除: 元の繰り返しを UNTIL 付きに更新し、以降の回を消す */
export async function truncateFollowing(input: {
  masterId: string;
  masterRRule: string;
  splitAt: Date;
}): Promise<void> {
  await runBatch([
    db.update(events).set({ rrule: input.masterRRule }).where(eq(events.id, input.masterId)),
    db
      .delete(events)
      .where(and(eq(events.seriesId, input.masterId), gte(events.occurrenceStart, input.splitAt))),
  ]);
}
