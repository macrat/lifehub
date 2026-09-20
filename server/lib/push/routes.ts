import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { pushSubscriptionSchema, unsubscribeSchema } from '../../../shared/validation/push.ts';
import type { AppEnv } from '../app-env.ts';
import { env } from '../env.ts';
import { validationHook } from '../validator.ts';
import * as repository from './repository.ts';

/** 購読の登録・解除。VAPID 公開鍵の配布。 */
export const pushRoutes = new Hono<AppEnv>()
  .get('/vapid-public-key', (c) => c.json({ publicKey: env.VAPID_PUBLIC_KEY ?? null }))
  .get(
    '/subscriptions/status',
    zValidator('query', unsubscribeSchema, validationHook),
    async (c) => {
      const row = await repository.findByEndpoint(c.req.valid('query').endpoint);
      return c.json({ subscribed: row !== undefined && row.userId === c.get('user').id });
    },
  )
  .post('/subscriptions', zValidator('json', pushSubscriptionSchema, validationHook), async (c) => {
    const input = c.req.valid('json');
    await repository.upsert({
      userId: c.get('user').id,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: c.req.header('user-agent') ?? null,
    });
    return c.body(null, 204);
  })
  .delete('/subscriptions', zValidator('json', unsubscribeSchema, validationHook), async (c) => {
    await repository.removeByEndpoint(c.req.valid('json').endpoint);
    return c.body(null, 204);
  });
