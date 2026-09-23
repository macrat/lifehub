import { createHash } from 'node:crypto';
import { Client, Receiver } from '@upstash/qstash';
import type { PlannedNotification } from '../features/events/notifications.ts';
import { env, isProduction, resolveBaseUrl } from './env.ts';

/**
 * QStash の予約と署名検証。予約した時刻に呼ばれる入口は server/lib/qstash-routes.ts。
 * 予約は本番（VERCEL_ENV=production）かつトークンがあるときだけ行う（Preview から本番と同じ通知が二重に飛ぶのを防ぐ）。
 * 署名検証は Preview でも行う。
 */
export type Publisher = {
  publish: (input: PlannedNotification) => Promise<void>;
};

/**
 * QStash の US リージョン（us-east-1）のエンドポイント。日本からのレイテンシが EU より小さい。
 * SDK の既定は EU（https://qstash.upstash.io）で、リージョンごとにアカウント・トークン・署名鍵が
 * 独立しているため、US のトークンを既定のまま使うと publish が 404 で失敗する。
 * SDK は QSTASH_URL 環境変数でも切り替えられるが、環境変数を増やすと設定漏れで EU に戻り、
 * しかもその失敗は通知が飛ばないという形でしか表に出ないので、コードに固定する。
 * 署名検証（Receiver）は鍵だけで完結しネットワークに出ないので、この URL は使わない。
 */
const QSTASH_US_URL = 'https://qstash-us-east-1.upstash.io';

/**
 * 通知のキーから QStash の deduplicationId を作る。
 * QStash は deduplicationId に ':' を許さない（400 になる）が、キーは区切りに ':' を使い、ISO 8601 の時刻も含む。
 * 文字を置き換えるだけだと、QStash が他に禁じる文字や長さの制限が増えたときにまた壊れ、置き換え先の文字との衝突も
 * 考えることになるので、SHA-256 の 16 進にして使える文字と長さを固定する。同じキーからは常に同じ ID になる。
 * キー自体は送信台帳の主キーでもあるので変えない。
 */
export function deduplicationIdOf(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function createPublisher(): Publisher | null {
  if (!isProduction || !env.QSTASH_TOKEN) return null;
  const client = new Client({ baseUrl: QSTASH_US_URL, token: env.QSTASH_TOKEN });
  const url = `${resolveBaseUrl()}/api/qstash/notifications`;
  return {
    publish: async ({ key, at, ref }) => {
      await client.publishJSON({
        url,
        body: { key, ref },
        notBefore: Math.ceil(at.getTime() / 1000),
        deduplicationId: deduplicationIdOf(key),
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
