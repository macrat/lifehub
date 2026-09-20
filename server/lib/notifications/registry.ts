import { eventsNotificationSource } from '../../features/events/notifications.ts';
import type { NotificationPayload, NotificationSource, PlannedNotification } from './types.ts';

/** 通知源の一覧。新しい feature の通知はここに 1 行足す。 */
const sources: NotificationSource[] = [eventsNotificationSource];

export async function listAll(range: { from: Date; to: Date }): Promise<PlannedNotification[]> {
  const lists = await Promise.all(sources.map((s) => s.list(range)));
  return lists.flat();
}

export async function resolve(key: string): Promise<NotificationPayload | null> {
  const source = sources.find((s) => key.startsWith(`${s.id}:`));
  if (!source) return null;
  return source.resolve(key);
}
