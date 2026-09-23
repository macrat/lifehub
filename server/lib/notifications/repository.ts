import { eq, lt } from 'drizzle-orm';
import { db } from '../db.ts';
import { sentNotifications } from './schema.ts';

/**
 * 送信済み台帳に key を記録する。既にあれば記録せず false（別の試行が先に送った）。
 * 記録と「まだ無いか」の判定を 1 文で行うので、同じ key の配信が同時に走っても送るのは片方だけ。
 */
export async function claim(key: string): Promise<boolean> {
  const inserted = await db
    .insert(sentNotifications)
    .values({ key })
    .onConflictDoNothing()
    .returning({ key: sentNotifications.key });
  return inserted.length > 0;
}

/** 記録を取り消す（送信に失敗した試行を、再試行できるように「未送信」へ戻す） */
export async function release(key: string): Promise<void> {
  await db.delete(sentNotifications).where(eq(sentNotifications.key, key));
}

/** before より前に記録した行を消す */
export async function purgeSentBefore(before: Date): Promise<void> {
  await db.delete(sentNotifications).where(lt(sentNotifications.sentAt, before));
}
