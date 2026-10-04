import { pushEndpointRefSchema, pushSubscriptionSchema } from '../../../shared/validation/push.ts';
import { procedure, router, userProcedure } from '../../lib/trpc.ts';
import * as service from './service.ts';

/** 購読の登録・解除。VAPID 公開鍵の配布。 */
export const pushRouter = router({
  vapidPublicKey: procedure.query(() => ({ publicKey: service.vapidPublicKey() })),
  status: userProcedure.input(pushEndpointRefSchema).query(async ({ ctx, input }) => ({
    subscribed: await service.isSubscribed(ctx.userId, input.endpoint),
  })),
  subscribe: userProcedure.input(pushSubscriptionSchema).mutation(async ({ ctx, input }) => {
    await service.subscribe(ctx.userId, input, ctx.userAgent);
  }),
  unsubscribe: userProcedure.input(pushEndpointRefSchema).mutation(async ({ ctx, input }) => {
    await service.unsubscribe(ctx.userId, input.endpoint);
  }),
});
