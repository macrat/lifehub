import { z } from 'zod';

/** 通信先をブラウザの Push サービスに限定し、内部ネットワークへの SSRF を防ぐ。 */
export const pushEndpointSchema = z
  .url()
  .max(4096)
  .regex(
    /^https:\/\/(?:fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)(?::443)?\/[^\s\\#]*$/i,
    '対応するブラウザのプッシュ通知 URL を指定してください',
  );

/** ブラウザの PushSubscription.toJSON() と同じ形 */
export const pushSubscriptionSchema = z.object({
  endpoint: pushEndpointSchema,
  keys: z.object({
    p256dh: z.string().regex(/^B[A-Za-z0-9_-]{86}=?$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}(==)?$/),
  }),
});

/**
 * 登録済みの購読を送信先で指す（解除と、購読しているかの確認）。
 * 不正な既存購読も解除できるよう、送信先の制約（`pushEndpointSchema`）は掛けない。
 */
export const pushEndpointRefSchema = z.object({ endpoint: z.url().max(4096) });
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;
