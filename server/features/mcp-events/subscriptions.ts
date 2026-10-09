import { createHash, timingSafeEqual } from 'node:crypto';
import { newId } from '../../../shared/id.ts';
import { newSecret } from '../../lib/secret.ts';
import * as repository from './repository.ts';
import type { EventName } from './service.ts';
import { postWebhook, webhookHeaders } from './webhook.ts';

/**
 * MCP Events の購読の作成・更新・取り消し（MCP のメソッドから呼ぶ。`mcp.ts`）。
 * 記録の変化を購読へ配るのは `service.ts`（記録を書く service はそちらだけを読む）。
 */

/** 購読の期限の既定かつ上限。クライアントはこれより前に購読し直す（refreshBefore） */
const MAX_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** 期限の下限。短すぎる期限で購読し直しが続かないように */
const MIN_TTL_MS = 60 * 1000;
/** 鍵を入れ替えた後、前の鍵でも署名する間 */
const SECRET_ROTATION_GRACE_MS = 24 * 60 * 60 * 1000;

/** 購読する人と、購読を求めた MCP クライアント（OAuth のクライアント ID） */
type Subscriber = { userId: string; clientId: string };

/**
 * 購読の id。購読の素性（人・クライアント・通知先・イベント名）から決めるので、同じ購読をし直すと同じ id になり、
 * 行を増やさずに期限と鍵を更新できる（MCP Events の冪等な購読）
 */
function subscriptionIdOf({ userId, clientId }: Subscriber, url: string, name: EventName): string {
  const digest = createHash('sha256')
    .update(JSON.stringify([userId, clientId, url, name]))
    .digest('hex');
  return `sub_${digest.slice(0, 32)}`;
}

type SubscribeInput = {
  name: EventName;
  url: string;
  secret: string;
  /** 望む期限（ミリ秒）。null は期限なしを望む（上限で切る）。省けば既定 */
  ttlMs?: number | null;
};

/**
 * 購読する（し直す）。初めての購読は、受け手が challenge を返せることを確かめてから保存する。
 * し直しは期限を延ばし、鍵が変わっていれば入れ替える（確かめ直さない）。
 * WHY NOT 期限なしを認める: 使われなくなった購読に送り続けないように、購読し直しで生きていることを示させる。
 */
export async function subscribe(
  subscriber: Subscriber,
  { name, url, secret, ttlMs }: SubscribeInput,
): Promise<{ ok: true; id: string; refreshBefore: Date } | { ok: false; reason: string }> {
  const now = new Date();
  const id = subscriptionIdOf(subscriber, url, name);
  const [current] = await Promise.all([repository.findById(id), repository.removeExpired(now)]);
  if (!current) {
    const verified = await verifyEndpoint(id, url, secret);
    if (!verified.ok) return verified;
  }
  const ttl = Math.min(Math.max(ttlMs ?? MAX_TTL_MS, MIN_TTL_MS), MAX_TTL_MS);
  const expiresAt = new Date(now.getTime() + ttl);
  const rotated = current && current.secret !== secret;
  await repository.upsert(
    { id, ...subscriber, name, url },
    {
      secret,
      expiresAt,
      ...(rotated
        ? {
            previousSecret: current.secret,
            previousSecretExpiresAt: new Date(now.getTime() + SECRET_ROTATION_GRACE_MS),
          }
        : {}),
    },
  );
  return { ok: true, id, refreshBefore: expiresAt };
}

/**
 * 受け手が購読を望んでいるかを確かめる（challenge を送り、同じ値が返ること）。
 * 他人の URL を通知先に書いて、LifeHub から無関係なサーバーへ POST させることを防ぐ。
 * 失敗は MCP Events の CallbackEndpointError の reason で返す。
 */
async function verifyEndpoint(
  subscriptionId: string,
  url: string,
  secret: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const challenge = newSecret();
  const body = JSON.stringify({ type: 'verification', challenge });
  const id = `msg_verification_${newId()}`;
  const response = await postWebhook(url, webhookHeaders(subscriptionId, [secret], id, body), body);
  if ('failure' in response) return { ok: false, reason: response.failure };
  if (response.status >= 500) return { ok: false, reason: 'http_5xx' };
  if (response.status < 200 || response.status >= 300) return { ok: false, reason: 'http_4xx' };
  if (!echoes(response.body, challenge)) return { ok: false, reason: 'challenge_failed' };
  return { ok: true };
}

function echoes(body: string, challenge: string): boolean {
  let echoed: unknown;
  try {
    echoed = (JSON.parse(body) as { challenge?: unknown }).challenge;
  } catch {
    return false;
  }
  if (typeof echoed !== 'string') return false;
  const [a, b] = [Buffer.from(echoed), Buffer.from(challenge)];
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 購読をやめる。無い購読をやめても何もしない（冪等） */
export async function unsubscribe(
  subscriber: Subscriber,
  { name, url }: { name: EventName; url: string },
): Promise<void> {
  await repository.remove(subscriptionIdOf(subscriber, url, name));
}
