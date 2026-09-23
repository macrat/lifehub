import { eq, lt } from 'drizzle-orm';
import { users } from '../../features/users/schema.ts';
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

/**
 * 全ユーザーの終日の予定・タスクの通知時刻（ユーザー ID → その日の 0:00 からの分）。通知の列挙と再検証が読む。
 * 値は users の行にあり、設定画面から users の service が書く。読むのは通知だけなので、読み出しは通知の側に置く。
 * WHY NOT users の service から読む: users の service は通知時刻が変わると通知を予約し直す
 * （lib/notifications/service.ts を呼ぶ）。通知の列挙がその service を読むと、
 * users → notifications → events の通知 → users と import が一巡し、読み込み時に互いを使う形に
 * 変わった途端に初期化の順序で壊れる。
 */
export async function findAllDayNotifyMinutes(): Promise<Map<string, number>> {
  const rows = await db.select({ id: users.id, minutes: users.allDayNotifyMinutes }).from(users);
  return new Map(rows.map((row) => [row.id, row.minutes]));
}
