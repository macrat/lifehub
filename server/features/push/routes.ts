import { Hono } from 'hono';
import { pushEndpointRefSchema, pushSubscriptionSchema } from '../../../shared/validation/push.ts';
import type { AppEnv } from '../../lib/app-env.ts';
import { validate } from '../../lib/validator.ts';
import * as service from './service.ts';

/** 購読の登録・解除。VAPID 公開鍵の配布。 */
export const pushRoutes = new Hono<AppEnv>()
  .get('/vapid-public-key', (c) => c.json({ publicKey: service.vapidPublicKey() }))
  .get('/subscriptions/status', validate('query', pushEndpointRefSchema), async (c) =>
    c.json({
      subscribed: await service.isSubscribed((await c.var.user).id, c.req.valid('query').endpoint),
    }),
  )
  .post('/subscriptions', validate('json', pushSubscriptionSchema), async (c) => {
    await service.subscribe(
      (await c.var.user).id,
      c.req.valid('json'),
      c.req.header('user-agent') ?? null,
    );
    return c.body(null, 204);
  })
  .delete('/subscriptions', validate('json', pushEndpointRefSchema), async (c) => {
    await service.unsubscribe((await c.var.user).id, c.req.valid('json').endpoint);
    return c.body(null, 204);
  });
