import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import webpush, { WebPushError } from 'web-push';
import { db } from '../../../lib/db/client.ts';
import { resetUsers } from '../../../lib/db/test-db.ts';
import { env } from '../../../lib/env.ts';
import { isSubscribed, sendToUsers, subscribe, unsubscribe } from '../service.ts';

const endpoint = 'https://fcm.googleapis.com/fcm/send/test';
const keys = { p256dh: 'test', auth: 'test' };

describe('push service', () => {
  let aliceId: string;
  let bobId: string;
  beforeEach(async () => {
    ({ userId: aliceId, partnerId: bobId } = await resetUsers());
  });

  it('購読しているのは持ち主だけで、同じ端末で別の人が購読し直すとその人のものになる', async () => {
    await subscribe(aliceId, { endpoint, keys }, null);
    expect(await isSubscribed(aliceId, endpoint)).toBe(true);
    expect(await isSubscribed(bobId, endpoint)).toBe(false);

    await subscribe(bobId, { endpoint, keys }, null);
    expect(await isSubscribed(aliceId, endpoint)).toBe(false);
    expect(await isSubscribed(bobId, endpoint)).toBe(true);
  });

  it('他人の購読は解除できない', async () => {
    await subscribe(aliceId, { endpoint, keys }, null);
    await unsubscribe(bobId, endpoint);
    expect(await isSubscribed(aliceId, endpoint)).toBe(true);
    await unsubscribe(aliceId, endpoint);
    expect(await isSubscribed(aliceId, endpoint)).toBe(false);
  });

  describe('送信', () => {
    const goneEndpoint = 'https://fcm.googleapis.com/fcm/send/gone';
    const vapid = {
      VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY,
    };
    afterEach(() => {
      Object.assign(env, vapid);
      vi.restoreAllMocks();
    });

    it('失効した購読を消せなくても、送信の失敗にしない（届いた端末へ送り直させない）', async () => {
      // 送信は外へ出さない。鍵の設定は形の検査だけなので止める
      Object.assign(env, { VAPID_PUBLIC_KEY: 'test-public', VAPID_PRIVATE_KEY: 'test-private' });
      vi.spyOn(webpush, 'setVapidDetails').mockImplementation(() => {});
      vi.spyOn(webpush, 'sendNotification').mockImplementation(async (sub) => {
        if (sub.endpoint === goneEndpoint) {
          throw new WebPushError('gone', 410, {}, '', goneEndpoint);
        }
        return { statusCode: 201, body: '', headers: {} };
      });
      await subscribe(aliceId, { endpoint, keys }, null);
      await subscribe(aliceId, { endpoint: goneEndpoint, keys }, null);
      vi.spyOn(db, 'delete').mockImplementation(() => {
        throw new Error('db down');
      });
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(
        sendToUsers([aliceId], { title: 't', body: 'b', url: '/', tag: 't' }),
      ).resolves.toEqual({
        sent: 1,
      });
      await vi.waitFor(() =>
        expect(logged).toHaveBeenCalledWith(
          'push: remove gone subscription failed',
          expect.any(Error),
        ),
      );
    });
  });
});
