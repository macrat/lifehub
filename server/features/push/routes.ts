import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { pushSubscriptionSchema, unsubscribeSchema } from '../../../shared/validation/push.ts';
import type { AppEnv } from '../../lib/app-env.ts';
import { env } from '../../lib/env.ts';
import { validationHook } from '../../lib/validator.ts';
import * as service from './service.ts';

/** 購読の登録・解除。VAPID 公開鍵の配布。 */
export const pushRoutes = new Hono<AppEnv>()
  .get('/vapid-public-key', (c) => c.json({ publicKey: env.VAPID_PUBLIC_KEY ?? null }))
  .get('/subscriptions/status', zValidator('query', unsubscribeSchema, validationHook), async (c) =>
    c.json({
      subscribed: await service.isSubscribed(c.get('user').id, c.req.valid('query').endpoint),
    }),
  )
  .post('/subscriptions', zValidator('json', pushSubscriptionSchema, validationHook), async (c) => {
    await service.subscribe(
      c.get('user').id,
      c.req.valid('json'),
      c.req.header('user-agent') ?? null,
    );
    return c.body(null, 204);
  })
  .delete('/subscriptions', zValidator('json', unsubscribeSchema, validationHook), async (c) => {
    await service.unsubscribe(c.get('user').id, c.req.valid('json').endpoint);
    return c.body(null, 204);
  });
