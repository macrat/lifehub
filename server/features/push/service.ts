import webpush, { WebPushError } from 'web-push';
import type { PushMessage } from '../../../shared/push.ts';
import { type PushSubscriptionInput, pushEndpointSchema } from '../../../shared/validation/push.ts';
import { env } from '../../lib/env.ts';
import * as repository from './repository.ts';

/**
 * Web Push の購読と送信。購読の行（push_subscriptions）を書き換えるのは、利用者の操作（登録・解除）と
 * 送信で届かなかった購読の片付けの 2 つで、どちらもここを通る。送信を通知の共通処理
 * （server/lib/notifications/service.ts）の側に置かないのは、そうすると lib から feature の
 * repository を直接触ることになり、購読の行を書き換える場所が 2 つに分かれるため。
 */

/** 端末の購読を登録する。同じ endpoint が既にあれば、今ログインしている人の購読として上書きする */
export async function subscribe(
  userId: string,
  input: PushSubscriptionInput,
  userAgent: string | null,
): Promise<void> {
  await repository.upsert({
    userId,
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    userAgent,
  });
}

/** 自分の購読だけを解除する（他人の endpoint を送られても消さない） */
export async function unsubscribe(userId: string, endpoint: string): Promise<void> {
  await repository.removeByEndpoint(endpoint, userId);
}

/**
 * この端末（endpoint）で本人が通知を受け取っているか。
 * 同じブラウザで別のユーザーが購読したまま入れ替わると、購読はブラウザに残っていても
 * 通知は前のユーザー宛てに届くので、持ち主が本人でなければ「受け取っていない」と答える。
 */
export async function isSubscribed(userId: string, endpoint: string): Promise<boolean> {
  const row = await repository.findByEndpoint(endpoint);
  return row?.userId === userId;
}

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
  // 端末ごとの送信は互いに独立なので並べて送る（1 台の遅い送り先が他の端末を待たせない）
  const results = await Promise.all(
    subscriptions.map(async (sub): Promise<'sent' | 'skipped' | { failure: unknown }> => {
      // 保存済みの購読も送信直前に検証する。web-push はリダイレクトを追わない。
      if (!pushEndpointSchema.safeParse(sub.endpoint).success) return 'skipped';
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(message),
          { TTL: 60 * 60, timeout: 10_000 },
        );
        return 'sent';
      } catch (error) {
        if (
          error instanceof WebPushError &&
          (error.statusCode === 404 || error.statusCode === 410)
        ) {
          await repository.removeByEndpoint(sub.endpoint, sub.userId);
          return 'skipped';
        }
        console.error('push: failed to send', error);
        return { failure: error };
      }
    }),
  );
  const sent = results.filter((r) => r === 'sent').length;
  const failures = results.flatMap((r) => (typeof r === 'object' ? [r.failure] : []));
  // 呼び出し元が送信済み台帳を確定せず、キューに再試行させられるようにする。
  if (failures.length > 0) throw new AggregateError(failures, 'push delivery failed');
  return { sent };
}
