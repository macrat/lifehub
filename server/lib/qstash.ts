import { Receiver } from '@upstash/qstash';
import { env } from './env.ts';

/**
 * QStash の配信の署名検証。QStash が呼ぶ入口（server/qstash.ts）がすべての配信に掛ける。
 * 予約する側は機能ごとに持つ（通知は server/features/notifications/publisher.ts）。署名検証は Preview でも行う。
 */
export async function verifyQStashSignature(request: Request, rawBody: string): Promise<boolean> {
  if (!env.QSTASH_CURRENT_SIGNING_KEY || !env.QSTASH_NEXT_SIGNING_KEY) return false;
  const signature = request.headers.get('upstash-signature');
  if (!signature) return false;
  const receiver = new Receiver({
    currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
  });
  try {
    return await receiver.verify({ signature, body: rawBody, clockTolerance: 30 });
  } catch {
    return false;
  }
}
