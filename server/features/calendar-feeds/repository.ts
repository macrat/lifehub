import { and, asc, eq, getTableColumns, sql } from 'drizzle-orm';
import { db, idArrayAgg, runBatch } from '../../lib/db.ts';
import { type CalendarFeedRow, calendarFeedParticipants, calendarFeeds } from './schema.ts';

/** 行と参加者。参加者は常に行と一緒に読む（別の問い合わせにすると往復が増えるだけで得が無い） */
export type CalendarFeedWithParticipants = CalendarFeedRow & { participantIds: string[] };

export async function findByUser(userId: string): Promise<CalendarFeedWithParticipants[]> {
  return db
    .select({
      ...getTableColumns(calendarFeeds),
      participantIds: idArrayAgg(calendarFeedParticipants.userId),
    })
    .from(calendarFeeds)
    .leftJoin(calendarFeedParticipants, eq(calendarFeedParticipants.feedId, calendarFeeds.id))
    .where(eq(calendarFeeds.userId, userId))
    .groupBy(calendarFeeds.id)
    .orderBy(asc(calendarFeeds.createdAt));
}

function participantRows(feedId: string, userIds: string[]) {
  return userIds.map((userId) => ({ feedId, userId }));
}

/** 行と参加者を原子的に作る */
export async function insert(
  values: { id: string; userId: string; name: string; token: string; createdAt: Date },
  participantIds: string[],
): Promise<void> {
  await runBatch((tx) => [
    tx.insert(calendarFeeds).values(values),
    tx.insert(calendarFeedParticipants).values(participantRows(values.id, participantIds)),
  ]);
}

/**
 * 名前と参加者を差し替える。持ち主のものだけを変更し、変更できたかどうかを返す。
 *
 * 持ち主の確認を書き込みと分けるのは、参加者の差し替え（消して入れ直す）が where だけでは
 * 持ち主に絞れないため。持ち主は行が消えるまで変わらないので確認と書き込みの間で覆らず、
 * 確認の後にその行が失効していた場合は参加者の挿入が外部キーで落ちて全文が取り消される。
 */
export async function update(
  id: string,
  userId: string,
  values: { name: string; participantIds: string[] },
): Promise<boolean> {
  const owned = await db
    .select({ id: calendarFeeds.id })
    .from(calendarFeeds)
    .where(and(eq(calendarFeeds.id, id), eq(calendarFeeds.userId, userId)))
    .limit(1);
  if (owned.length === 0) return false;
  await runBatch((tx) => [
    tx.update(calendarFeeds).set({ name: values.name }).where(eq(calendarFeeds.id, id)),
    tx.delete(calendarFeedParticipants).where(eq(calendarFeedParticipants.feedId, id)),
    tx.insert(calendarFeedParticipants).values(participantRows(id, values.participantIds)),
  ]);
  return true;
}

/** 失効。持ち主のものだけを消し、消せたかどうかを返す（参加者は CASCADE で一緒に消える） */
export async function remove(id: string, userId: string): Promise<boolean> {
  const removed = await db
    .delete(calendarFeeds)
    .where(and(eq(calendarFeeds.id, id), eq(calendarFeeds.userId, userId)))
    .returning({ id: calendarFeeds.id });
  return removed.length > 0;
}

/**
 * トークンに対応する行の最終アクセス日時を更新し、その URL に載せる参加者を返す（無ければ undefined）。
 * 照合・記録・参加者の読み取りを 1 文にまとめるので、配信 1 回あたりの問い合わせは
 * 予定の読み取りと合わせて 2 回で済む。
 */
export async function touchByToken(
  token: string,
  now: Date,
): Promise<{ participantIds: string[] } | undefined> {
  const touched = await db
    .update(calendarFeeds)
    .set({ lastAccessedAt: now })
    .where(eq(calendarFeeds.token, token))
    .returning({
      participantIds: sql<
        string[]
      >`coalesce((select array_agg(${calendarFeedParticipants.userId}::text) from ${calendarFeedParticipants} where ${calendarFeedParticipants.feedId} = ${calendarFeeds.id}), '{}')`,
    });
  return touched[0];
}
