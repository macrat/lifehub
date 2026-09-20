import { z } from 'zod';

/** ブラウザの PushSubscription.toJSON() と同じ形 */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export const unsubscribeSchema = z.object({ endpoint: z.url() });
