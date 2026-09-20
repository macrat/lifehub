import { eq, inArray } from 'drizzle-orm';
import { db } from '../db.ts';
import { newId } from '../id.ts';
import { type PushSubscriptionRow, pushSubscriptions } from './schema.ts';

export async function upsert(row: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
}): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({ ...row, id: newId(), createdBy: row.userId })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId: row.userId,
        p256dh: row.p256dh,
        auth: row.auth,
        userAgent: row.userAgent,
        updatedAt: new Date(),
      },
    });
}

export async function removeByEndpoint(endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

export async function findByEndpoint(endpoint: string): Promise<PushSubscriptionRow | undefined> {
  const rows = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .limit(1);
  return rows[0];
}

/** userIds が null なら全員（共有の予定・タスク） */
export async function findByUserIds(userIds: string[] | null): Promise<PushSubscriptionRow[]> {
  if (userIds === null) return db.select().from(pushSubscriptions);
  if (userIds.length === 0) return [];
  return db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, userIds));
}
