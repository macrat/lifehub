import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Expense } from '../../../shared/expenses.ts';
import { newId } from '../../../shared/id.ts';
import type { CareLog } from '../../../shared/lemon.ts';
import type { Memo } from '../../../shared/memos.ts';
import { afterResponse } from '../../lib/after-response.ts';
import { formatCareLog, formatEvent, formatExpense, formatMemo } from '../../lib/mcp/entries.ts';
import { nameOf } from '../../lib/mcp/people.ts';
import type { Person } from '../../lib/mcp/types.ts';
import { listUsers } from '../users/service.ts';
import * as repository from './repository.ts';
import type { McpEventSubscriptionRow } from './schema.ts';
import { postWebhook, verifyEndpoint, type WebhookPost, webhookHeaders } from './webhook.ts';

/**
 * MCP Events（webhook 配信）の購読と配信。記録を書いた service が `publishSaved` を呼び、
 * 購読があればその記録を LLM 向けの形（ツールが返すエントリーと同じ）にして、購読ごとに POST する。
 * どの経路（画面・MCP・API キー）の書き込みも service を通るので、ここで漏れなく拾える。
 */

/** 購読できるイベント。記録の種類ごとに 1 つで、追加と編集の両方で届く（消したときは届かない） */
export const EVENT_NAMES = {
  memo: 'memo.saved',
  event: 'event.saved',
  expense: 'expense.saved',
  lemon: 'lemon.saved',
} as const;
export type EventName = (typeof EVENT_NAMES)[keyof typeof EVENT_NAMES];

type WrittenEvent = Parameters<typeof formatEvent>[0];

/** 書いた記録。予定・タスクは書いた後の値を読み直す必要があるときだけ、読む関数で渡す（購読が無ければ読まない） */
export type SavedRecord =
  | { type: 'memo'; record: Memo }
  | { type: 'event'; record: WrittenEvent | (() => Promise<WrittenEvent>) }
  | { type: 'expense'; record: Expense }
  | { type: 'lemon'; record: CareLog };

/** 書いた人。API キーで入れた記録は人が分からないので、キーの名前 */
export type Actor = { userId: string } | { apiKeyName: string };

/** 届けるイベント 1 件（MCP Events の EventOccurrence） */
type Occurrence = {
  eventId: string;
  name: EventName;
  timestamp: string;
  data: Record<string, unknown>;
  cursor: null;
};

type DeliveryOptions = { post?: WebhookPost; retryDelaysMs?: number[] };

/**
 * 記録を書いたことを知らせる。応答は待たせず、応答を返した後に配る（`afterResponse`）。
 * 購読が無ければ問い合わせ 1 回で終わる。
 */
export function publishSaved(
  saved: SavedRecord,
  action: 'added' | 'updated',
  actor: Actor,
  options?: DeliveryOptions,
): void {
  afterResponse('mcp-events', () => deliverSaved(saved, action, actor, options));
}

export async function deliverSaved(
  saved: SavedRecord,
  action: 'added' | 'updated',
  actor: Actor,
  { post = postWebhook, retryDelaysMs = [2_000, 10_000] }: DeliveryOptions = {},
): Promise<void> {
  const name = EVENT_NAMES[saved.type];
  const subscriptions = await repository.findActive(name, new Date());
  if (subscriptions.length === 0) return;
  const people: Person[] = (await listUsers()).map(({ id, name }) => ({ id, name }));
  const entry = await formatSaved(saved, people);
  const occurrence: Occurrence = {
    // 追加は記録ごとに 1 度きりなので記録の ID から決める（オフラインの再送で同じ追加が 2 度書かれても、
    // 受け手が webhook-id で重複を捨てられる）。編集は毎回別の出来事
    eventId: action === 'added' ? `evt_${entry.ref}` : `evt_${newId()}`,
    name,
    timestamp: new Date().toISOString(),
    data: {
      action,
      by: 'userId' in actor ? nameOf(people, actor.userId) : `API キー「${actor.apiKeyName}」`,
      entry,
    },
    cursor: null,
  };
  await Promise.all(subscriptions.map((sub) => deliverTo(sub, occurrence, post, retryDelaysMs)));
}

async function formatSaved(saved: SavedRecord, people: Person[]) {
  switch (saved.type) {
    case 'memo':
      return formatMemo(saved.record, people);
    case 'event': {
      const { record } = saved;
      return formatEvent(typeof record === 'function' ? await record() : record, people);
    }
    case 'expense':
      return formatExpense(saved.record, people);
    case 'lemon':
      return formatCareLog(saved.record, people);
  }
}

/** 受け手が受け取れる本文の上限（MCP Events）。記録 1 件は収まるので、越えたら送らずにログに残す */
const MAX_BODY_BYTES = 256 * 1024;

/**
 * 1 つの購読に届ける。届かなければ間を空けて送り直す（eventId は変えないので、受け手が重複を捨てられる）。
 * 410 は受け手が購読をやめたので購読を消す。413 とほかの 4xx は送り直しても変わらないので諦める
 * （408 と 429 だけは時間を置けば通りうるので送り直す）。
 */
async function deliverTo(
  sub: McpEventSubscriptionRow,
  occurrence: Occurrence,
  post: WebhookPost,
  retryDelaysMs: number[],
): Promise<void> {
  const body = JSON.stringify(occurrence);
  if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
    console.error('mcp-events: event payload too large', sub.id, occurrence.eventId);
    return;
  }
  for (const delay of [0, ...retryDelaysMs]) {
    if (delay > 0) await sleep(delay);
    const headers = webhookHeaders(sub.id, secretsOf(sub, new Date()), occurrence.eventId, body);
    const response = await post(sub.url, headers, body);
    if ('status' in response) {
      const { status } = response;
      if (status >= 200 && status < 300) return;
      if (status === 410) return repository.remove(sub.id);
      if (status < 500 && status !== 408 && status !== 429) break;
    }
  }
  console.error('mcp-events: delivery failed', sub.id, occurrence.eventId);
}

/** 署名に使う鍵。鍵を入れ替えた直後は前の鍵でも署名する（入れ替えの前に送り始めた配信も受け手が確かめられる） */
function secretsOf(sub: McpEventSubscriptionRow, now: Date): string[] {
  const { secret, previousSecret, previousSecretExpiresAt } = sub;
  return previousSecret && previousSecretExpiresAt && previousSecretExpiresAt > now
    ? [secret, previousSecret]
    : [secret];
}

/** 購読の期限の既定かつ上限。クライアントはこれより前に購読し直す（refreshBefore） */
const MAX_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** 期限の下限。短すぎる期限で購読し直しが続かないように */
const MIN_TTL_MS = 60 * 1000;
/** 鍵を入れ替えた後、前の鍵でも署名する間 */
const SECRET_ROTATION_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * 購読の id。購読の素性（人・通知先・イベント名）から決めるので、同じ購読をし直すと同じ id になり、
 * 行を増やさずに期限と鍵を更新できる（MCP Events の冪等な購読）
 */
function subscriptionIdOf(userId: string, url: string, name: EventName): string {
  const digest = createHash('sha256')
    .update(JSON.stringify([userId, url, name]))
    .digest('hex');
  return `sub_${digest.slice(0, 32)}`;
}

export type SubscribeInput = {
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
  userId: string,
  { name, url, secret, ttlMs }: SubscribeInput,
  post: WebhookPost = postWebhook,
): Promise<{ ok: true; id: string; refreshBefore: Date } | { ok: false; reason: string }> {
  const now = new Date();
  const id = subscriptionIdOf(userId, url, name);
  const [current] = await Promise.all([repository.findById(id), repository.removeExpired(now)]);
  if (!current) {
    const verified = await verifyEndpoint(post, id, url, secret);
    if (!verified.ok) return verified;
  }
  const ttl = Math.min(Math.max(ttlMs ?? MAX_TTL_MS, MIN_TTL_MS), MAX_TTL_MS);
  const expiresAt = new Date(now.getTime() + ttl);
  const rotated = current && current.secret !== secret;
  await repository.upsert({
    id,
    userId,
    name,
    url,
    secret,
    expiresAt,
    ...(rotated
      ? {
          previousSecret: current.secret,
          previousSecretExpiresAt: new Date(now.getTime() + SECRET_ROTATION_GRACE_MS),
        }
      : {}),
  });
  return { ok: true, id, refreshBefore: expiresAt };
}

/** 購読をやめる。無い購読をやめても何もしない（冪等） */
export async function unsubscribe(
  userId: string,
  { name, url }: { name: EventName; url: string },
): Promise<void> {
  await repository.remove(subscriptionIdOf(userId, url, name));
}
