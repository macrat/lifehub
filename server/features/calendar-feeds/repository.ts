import { and, asc, eq } from 'drizzle-orm';
import { db } from '../../lib/db.ts';
import { calendarFeeds } from './schema.ts';

/** 画面と配信に必要な列だけ。トークンは URL を組み立てるためにだけ読む */
export type CalendarFeedRow = {
  id: string;
  name: string;
  token: string;
  createdAt: Date;
  lastAccessedAt: Date | null;
};

const columns = {
  id: calendarFeeds.id,
  name: calendarFeeds.name,
  token: calendarFeeds.token,
  createdAt: calendarFeeds.createdAt,
  lastAccessedAt: calendarFeeds.lastAccessedAt,
};

export async function findByUser(userId: string): Promise<CalendarFeedRow[]> {
  return db
    .select(columns)
    .from(calendarFeeds)
    .where(eq(calendarFeeds.userId, userId))
    .orderBy(asc(calendarFeeds.createdAt));
}

/** 追加して、保存された行をそのまま返す（作成日時を読み直さずに済む） */
export async function insert(values: {
  id: string;
  userId: string;
  name: string;
  token: string;
}): Promise<CalendarFeedRow> {
  const [row] = await db.insert(calendarFeeds).values(values).returning(columns);
  if (!row) throw new Error('配信 URL を保存できませんでした');
  return row;
}

/** 失効。持ち主のものだけを消し、消せたかどうかを返す */
export async function remove(id: string, userId: string): Promise<boolean> {
  const removed = await db
    .delete(calendarFeeds)
    .where(and(eq(calendarFeeds.id, id), eq(calendarFeeds.userId, userId)))
    .returning({ id: calendarFeeds.id });
  return removed.length > 0;
}

/**
 * トークンに対応する行の最終アクセス日時を更新し、更新できたら true を返す。
 * 照合と記録を 1 文にまとめるので、配信 1 回あたりの問い合わせは予定の読み取りと合わせて 2 回で済む。
 */
export async function touchByToken(token: string, now: Date): Promise<boolean> {
  const touched = await db
    .update(calendarFeeds)
    .set({ lastAccessedAt: now })
    .where(eq(calendarFeeds.token, token))
    .returning({ id: calendarFeeds.id });
  return touched.length > 0;
}
