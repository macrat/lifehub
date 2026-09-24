import { z } from 'zod';

/**
 * 記録投入用の API キー（[docs/features/api-keys.md](../../docs/features/api-keys.md)）。
 * 決められるのは名前だけで、キーそのものはサーバーが作る。
 */
export const apiKeySchema = z.object({
  /** 渡した先（デバイスやサービス）を見分けて個別に失効させるための名前 */
  name: z.string().trim().min(1, '名前を入力してください').max(50),
});
export type ApiKeyInput = z.infer<typeof apiKeySchema>;
