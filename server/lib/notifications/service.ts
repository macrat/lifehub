import { addDays } from 'date-fns';
import { startOfDay } from '../../../shared/date.ts';
import type { PushMessage } from '../../../shared/push.ts';
import {
  listNotifications,
  type NotificationRef,
  resolveNotification,
} from '../../features/events/notifications.ts';
import { sendToUsers } from '../../features/push/service.ts';
import { createPublisher, type Publisher } from '../qstash.ts';
import * as repository from './repository.ts';

const SENT_RETENTION_DAYS = 30;

/** 指定期間の通知を列挙して QStash に予約する。予約先が無い環境（ローカル・Preview）では何もしない。 */
export async function enqueueRange(
  range: { from: Date; to: Date },
  publisher: Publisher | null = createPublisher(),
): Promise<{ planned: number; published: number }> {
  const planned = await listNotifications(range);
  if (!publisher) return { planned: planned.length, published: 0 };
  // 1 件ずつ待つと件数分の往復が直列に積み重なり、予定を保存した応答（enqueueUpcoming）が遅れる。
  // 並べて投げ、失敗した分だけ記録する（1 件の失敗で他を止めない。重複は deduplicationId で防がれる）
  const published = await Promise.all(
    planned.map(async (item) => {
      try {
        await publisher.publish(item);
        return true;
      } catch (error) {
        console.error(`notifications: failed to publish ${item.key}`, error);
        return false;
      }
    }),
  );
  return { planned: planned.length, published: published.filter(Boolean).length };
}

/** 日次 Cron: 翌日分（JST の翌日 0:00 〜 翌々日 0:00）を予約し、古い送信台帳を消す */
export async function enqueueTomorrow(
  now: Date = new Date(),
): Promise<{ planned: number; published: number }> {
  const from = addDays(startOfDay(now), 1);
  const to = addDays(from, 1);
  await repository.purgeSentBefore(addDays(now, -SENT_RETENTION_DAYS));
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
  if (!(await repository.claim(key))) return 'duplicate';
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
    await repository.release(key);
    throw error;
  }
  return 'sent';
}
