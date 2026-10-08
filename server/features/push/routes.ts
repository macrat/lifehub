import { pushEndpointRefSchema, pushSubscriptionSchema } from '../../../shared/validation/push.ts';
import { procedure, router } from '../../lib/trpc.ts';
import * as service from './service.ts';

/** 購読の登録・解除。VAPID 公開鍵の配布。 */
export const pushRouter = router({
  vapidPublicKey: procedure.query(() => ({ publicKey: service.vapidPublicKey() })),
  status: procedure.input(pushEndpointRefSchema).query(async ({ ctx, input }) => ({
    subscribed: await service.isSubscribed(ctx.user.id, input.endpoint),
  })),
  subscribe: procedure.input(pushSubscriptionSchema).mutation(async ({ ctx, input }) => {
    await service.subscribe(ctx.user.id, input, ctx.userAgent);
  }),
  unsubscribe: procedure.input(pushEndpointRefSchema).mutation(async ({ ctx, input }) => {
    await service.unsubscribe(ctx.user.id, input.endpoint);
  }),
});
