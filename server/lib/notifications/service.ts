import { addDays } from 'date-fns';
import { eq, lt } from 'drizzle-orm';
import { startOfDay } from '../../../shared/date.ts';
import type { PushMessage } from '../../../shared/push.ts';
import {
  listNotifications,
  type NotificationRef,
  resolveNotification,
} from '../../features/events/notifications.ts';
import { db } from '../db.ts';
import { sendToUsers } from '../push/send.ts';
import { createPublisher, type Publisher } from '../qstash.ts';
import { sentNotifications } from './schema.ts';

const SENT_RETENTION_DAYS = 30;

/** 指定期間の通知を列挙して QStash に予約する。予約先が無い環境（ローカル・Preview）では何もしない。 */
export async function enqueueRange(
  range: { from: Date; to: Date },
  publisher: Publisher | null = createPublisher(),
): Promise<{ planned: number; published: number }> {
  const planned = await listNotifications(range);
  if (!publisher) return { planned: planned.length, published: 0 };
  let published = 0;
  for (const item of planned) {
    try {
      await publisher.publish(item);
      published++;
    } catch (error) {
      console.error(`notifications: failed to publish ${item.key}`, error);
    }
  }
  return { planned: planned.length, published };
}

/** 日次 Cron: 翌日分（JST の翌日 0:00 〜 翌々日 0:00）を予約し、古い送信台帳を消す */
export async function enqueueTomorrow(
  now: Date = new Date(),
): Promise<{ planned: number; published: number }> {
  const from = addDays(startOfDay(now), 1);
  const to = addDays(from, 1);
  await db
    .delete(sentNotifications)
    .where(lt(sentNotifications.sentAt, addDays(now, -SENT_RETENTION_DAYS)));
  return enqueueRange({ from, to });
}

/**
 * 予定・タスクの作成／変更時: 今から翌日の終わりまでに発生する通知をその場で予約する。
 * 日次 Cron が既に予約した分は deduplicationId で重複しない。失敗しても呼び出し元の処理は止めない。
 */
export async function enqueueUpcoming(now: Date = new Date()): Promise<void> {
  try {
    await enqueueRange({ from: now, to: addDays(startOfDay(now), 2) });
  } catch (error) {
    console.error('notifications: enqueueUpcoming failed', error);
  }
}

/** 配信: 台帳に無いキーだけ、参照を再検証して送る。 */
export async function deliver(
  key: string,
  ref: NotificationRef,
  send: (userIds: string[], message: PushMessage) => Promise<unknown> = sendToUsers,
): Promise<'sent' | 'duplicate' | 'stale'> {
  const inserted = await db
    .insert(sentNotifications)
    .values({ key })
    .onConflictDoNothing()
    .returning({ key: sentNotifications.key });
  if (inserted.length === 0) return 'duplicate';
  const payload = await resolveNotification(ref);
  if (!payload) return 'stale';
  try {
    await send(payload.userIds, {
      title: payload.title,
      body: payload.body,
      url: payload.url,
      tag: key,
    });
  } catch (error) {
    // QStash が再試行できるよう、送信に失敗した試行を「送信済み」にしない。
    await db.delete(sentNotifications).where(eq(sentNotifications.key, key));
    throw error;
  }
  return 'sent';
}
