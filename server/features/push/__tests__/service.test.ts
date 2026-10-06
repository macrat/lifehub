import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebPushError } from 'web-push';
import { db } from '../../../lib/db/client.ts';
import { resetUsers } from '../../../lib/db/test-db.ts';
import { isSubscribed, sendToUsers, subscribe, unsubscribe } from '../service.ts';
import { stubWebPush } from './web-push-stub.ts';

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
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('失効した購読を消せなくても、送信の失敗にしない（届いた端末へ送り直させない）', async () => {
      stubWebPush((to) =>
        to === goneEndpoint ? new WebPushError('gone', 410, {}, '', goneEndpoint) : undefined,
      );
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
