import webpush, { WebPushError } from 'web-push';
import { env } from '../env.ts';
import * as repository from './repository.ts';

export type PushMessage = {
  title: string;
  body: string;
  /** タップで開く画面（アプリ内パス） */
  url: string;
  /** 通知を束ねるタグ（同じキーの再送で二重表示しない） */
  tag: string;
};

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
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(message),
        { TTL: 60 * 60 },
      );
      sent++;
    } catch (error) {
      if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
        await repository.removeByEndpoint(sub.endpoint);
        continue;
      }
      console.error('push: failed to send', error);
    }
  }
  return { sent };
}
