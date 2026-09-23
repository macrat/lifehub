import webpush, { WebPushError } from 'web-push';
import type { PushMessage } from '../../../shared/push.ts';
import { pushEndpointSchema } from '../../../shared/validation/push.ts';
import { env } from '../env.ts';
import * as repository from './repository.ts';

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(
    env.VAPID_SUBJECT ?? 'mailto:admin@example.com',
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  );
  configured = true;
  return true;
}

/** 対象ユーザーの全端末へ送る。410/404 を返した購読は削除する。 */
export async function sendToUsers(
  userIds: string[],
  message: PushMessage,
): Promise<{ sent: number }> {
  if (!ensureConfigured()) {
    console.warn('push: VAPID keys are not configured; skipping');
    return { sent: 0 };
  }
  const subscriptions = await repository.findByUserIds(userIds);
  let sent = 0;
  const failures: unknown[] = [];
  for (const sub of subscriptions) {
    // 保存済みの購読も送信直前に検証する。web-push はリダイレクトを追わない。
    if (!pushEndpointSchema.safeParse(sub.endpoint).success) continue;
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(message),
        { TTL: 60 * 60, timeout: 10_000 },
      );
      sent++;
    } catch (error) {
      if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
        await repository.removeByEndpoint(sub.endpoint, sub.userId);
        continue;
      }
      console.error('push: failed to send', error);
      failures.push(error);
    }
  }
  // 呼び出し元が送信済み台帳を確定せず、キューに再試行させられるようにする。
  if (failures.length > 0) throw new AggregateError(failures, 'push delivery failed');
  return { sent };
}
