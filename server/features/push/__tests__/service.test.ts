import { beforeEach, describe, expect, it } from 'vitest';
import { truncateAll } from '../../../lib/test-db.ts';
import { createUser } from '../../users/service.ts';
import { isSubscribed, subscribe, unsubscribe } from '../service.ts';

const endpoint = 'https://fcm.googleapis.com/fcm/send/test';
const keys = { p256dh: 'test', auth: 'test' };

describe('push service', () => {
  let aliceId: string;
  let bobId: string;
  beforeEach(async () => {
    await truncateAll();
    aliceId = (await createUser({ email: 'a@example.com', name: 'A', password: 'password-123456' }))
      .id;
    bobId = (await createUser({ email: 'b@example.com', name: 'B', password: 'password-123456' }))
      .id;
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
});
