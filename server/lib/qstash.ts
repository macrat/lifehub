import { Client, Receiver } from '@upstash/qstash';
import { env, isProduction, resolveBaseUrl } from './env.ts';

/**
 * QStash の予約と署名検証。
 * 予約は本番（VERCEL_ENV=production）かつトークンがあるときだけ行う（Preview から本番と同じ通知が二重に飛ぶのを防ぐ）。
 * 署名検証は Preview でも行う。
 */
export type Publisher = {
  publish: (input: { key: string; at: Date }) => Promise<void>;
};

export function createPublisher(): Publisher | null {
  if (!isProduction || !env.QSTASH_TOKEN) return null;
  const client = new Client({ token: env.QSTASH_TOKEN });
  const url = `${resolveBaseUrl()}/api/notifications/deliver`;
  return {
    publish: async ({ key, at }) => {
      await client.publishJSON({
        url,
        body: { key },
        notBefore: Math.ceil(at.getTime() / 1000),
        deduplicationId: key,
        retries: 3,
      });
    },
  };
}

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
