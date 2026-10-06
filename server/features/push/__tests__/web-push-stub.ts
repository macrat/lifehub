import { onTestFinished, vi } from 'vitest';
import webpush from 'web-push';
import type { PushMessage } from '../../../../shared/push.ts';
import { env } from '../../../lib/env.ts';

/** 送った Web Push 1 件（宛先の端末と中身） */
export type SentPush = { endpoint: string; message: PushMessage };

/**
 * テストの間、Web Push を外へ出さずに手元の配列へ受け取る。鍵の設定は形の検査だけなので止める。
 * fail が Error を返した端末へは送れなかったことにする（その Error を投げる）。
 * 鍵の環境変数はテストの終わりに戻す。spy は呼び出し側の `vi.restoreAllMocks` で戻す。
 */
export function stubWebPush(fail?: (endpoint: string) => Error | undefined): SentPush[] {
  const vapid = {
    VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY,
  };
  Object.assign(env, { VAPID_PUBLIC_KEY: 'test-public', VAPID_PRIVATE_KEY: 'test-private' });
  onTestFinished(() => {
    Object.assign(env, vapid);
  });
  vi.spyOn(webpush, 'setVapidDetails').mockImplementation(() => {});
  const sent: SentPush[] = [];
  vi.spyOn(webpush, 'sendNotification').mockImplementation(async (sub, payload) => {
    const error = fail?.(sub.endpoint);
    if (error) throw error;
    sent.push({ endpoint: sub.endpoint, message: JSON.parse(String(payload)) });
    return { statusCode: 201, body: '', headers: {} };
  });
  return sent;
}
