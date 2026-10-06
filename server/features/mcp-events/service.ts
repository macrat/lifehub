import { createHash, timingSafeEqual } from 'node:crypto';
import type { CalendarItem, WrittenEvent } from '../../../shared/calendar.ts';
import type { Expense } from '../../../shared/expenses.ts';
import { newId } from '../../../shared/id.ts';
import type { CareLog } from '../../../shared/lemon.ts';
import type { Memo } from '../../../shared/memos.ts';
import type { Actor } from '../../lib/actor.ts';
import { afterResponse } from '../../lib/after-response.ts';
import {
  type FormattedEntry,
  formatCareLog,
  formatEvent,
  formatExpense,
  formatMemo,
} from '../../lib/mcp/entries.ts';
import { authorName, type Person } from '../../lib/people.ts';
import { newSecret } from '../../lib/secret.ts';
import { listPeople } from '../users/people.ts';
import * as repository from './repository.ts';
import type { McpEventSubscriptionRow } from './schema.ts';
import { postWebhook, webhookHeaders } from './webhook.ts';

/**
 * MCP Events（webhook 配信）の購読と配信。記録を書いた・消した service が `publishChanged` を呼び、
 * 購読があればその記録を LLM 向けの形（ツールが返すエントリーと同じ）にして、購読ごとに POST する。
 * どの経路（画面・MCP・API キー）の書き込みも service を通るので、ここで漏れなく拾える。
 * 予定・タスクの通知は、プッシュ通知を送った通知の service が `publishReminder` を呼ぶ。
 */

/**
 * 購読できるイベント。記録の変化は種類ごとに 1 つで、追加・編集・削除のどれでも届く。
 * reminder は予定・タスクの通知で、プッシュ通知と同じ時に届く
 */
export const EVENT_NAMES = {
  memo: 'memo.changed',
  event: 'event.changed',
  expense: 'expense.changed',
  lemon: 'lemon.changed',
  reminder: 'event.reminder',
} as const;
export type EventName = (typeof EVENT_NAMES)[keyof typeof EVENT_NAMES];

/**
 * 書いた記録（消したときは消す前の記録）。予定・タスクは書いた後の値を読み直す必要があるときだけ、
 * 読む関数で渡す（購読が無ければ読まない）。繰り返しの回を消したときは、その回だけか以降すべてか（scope）も添える
 */
type ChangedRecord =
  | { type: 'memo'; record: Memo }
  | {
      type: 'event';
      record: WrittenEvent | (() => Promise<WrittenEvent>);
      scope?: 'this' | 'following';
    }
  | { type: 'expense'; record: Expense }
  | { type: 'lemon'; record: CareLog };

type Action = 'added' | 'updated' | 'deleted';

/** 届けるイベント 1 件（MCP Events の EventOccurrence） */
type Occurrence = {
  eventId: string;
  name: EventName;
  timestamp: string;
  data: Record<string, unknown>;
  cursor: null;
};

/**
 * 記録を書いた・消したことを知らせる。応答は待たせず、応答を返した後に配る（`afterResponse`）。
 * 購読が無ければ問い合わせ 1 回で終わる。
 */
export function publishChanged(changed: ChangedRecord, action: Action, actor: Actor): void {
  afterResponse('mcp-events', () => deliverChanged(changed, action, actor));
}

async function deliverChanged(changed: ChangedRecord, action: Action, actor: Actor): Promise<void> {
  const name = EVENT_NAMES[changed.type];
  const subscriptions = await repository.findActive(name, new Date());
  if (subscriptions.length === 0) return;
  const [people, format] = await Promise.all([listPeople(), formatterOf(changed)]);
  const entry = format(people);
  await deliverAll(subscriptions, {
    // 追加と削除は記録（回）ごとに 1 度きりなので、記録の ref から決める（オフラインの再送で同じ追加・削除が
    // 2 度知らされても、受け手が webhook-id で重複を捨てられる）。編集は毎回別の出来事
    eventId: action === 'updated' ? `evt_${newId()}` : `evt_${action}_${entry.ref}`,
    name,
    timestamp: new Date().toISOString(),
    data: {
      action,
      by: authorName(people, actor),
      entry,
      ...(changed.type === 'event' && changed.scope ? { scope: changed.scope } : {}),
    },
    cursor: null,
  });
}

/** プッシュ通知を送った予定・タスクの通知のうち、届けるもの（通知した発生・何の通知か・宛先） */
type Reminder = {
  item: CalendarItem;
  /** 開始の通知か、予定の終了の通知か */
  about: 'start' | 'end';
  userIds: string[];
};

/**
 * 予定・タスクの通知を知らせる。プッシュ通知を送った後に呼び、応答の後に配る（`afterResponse`）。
 * 届けるのはプッシュ通知の宛先と同じ人の購読だけ（通知は参加者に宛てたもので、記録の変化と違い家族全員へは送らない）。
 */
export function publishReminder(key: string, reminder: Reminder): void {
  afterResponse('mcp-events', () => deliverReminder(key, reminder));
}

/** key は通知のキー（送信台帳の主キー）で、通知 1 件ごとに一意 */
async function deliverReminder(key: string, { item, about, userIds }: Reminder): Promise<void> {
  const name = EVENT_NAMES.reminder;
  const subscriptions = (await repository.findActive(name, new Date())).filter((sub) =>
    userIds.includes(sub.userId),
  );
  if (subscriptions.length === 0) return;
  const people = await listPeople();
  await deliverAll(subscriptions, {
    // 通知は 1 件ごとに 1 度きりなので、通知のキーから決める（同じ通知を 2 度配っても、受け手が重複を捨てられる）
    eventId: `evt_reminder_${key}`,
    name,
    timestamp: new Date().toISOString(),
    data: {
      about,
      entry: formatEvent(item, people),
    },
    cursor: null,
  });
}

function deliverAll(subscriptions: McpEventSubscriptionRow[], occurrence: Occurrence) {
  return Promise.all(subscriptions.map((sub) => deliverTo(sub, occurrence)));
}

/** 記録をエントリーの形にする関数。予定・タスクを読み直すときは、人の一覧と並べて読めるよう先に読む */
async function formatterOf(changed: ChangedRecord): Promise<(people: Person[]) => FormattedEntry> {
  switch (changed.type) {
    case 'memo':
      return (people) => formatMemo(changed.record, people);
    case 'event': {
      const { record } = changed;
      const written = typeof record === 'function' ? await record() : record;
      return (people) => formatEvent(written, people);
    }
    case 'expense':
      return (people) => formatExpense(changed.record, people);
    case 'lemon':
      return (people) => formatCareLog(changed.record, people);
  }
}

/**
 * 受け手が受け取れる本文の上限（MCP Events）。記録の本文は短い（メモでも 500 文字まで）ので普通は越えないが、
 * 越えた本文は受け手が 413 で断るだけなので、送らずにログに残す
 */
const MAX_BODY_BYTES = 256 * 1024;

/** 届かなかったときに送り直すまでの間 */
const RETRY_DELAYS_MS = [2_000, 10_000];

/**
 * 1 つの購読に届ける。届かなければ間を空けて送り直す（eventId は変えないので、受け手が重複を捨てられる）。
 * 410 は受け手が購読をやめたので購読を消す。413 とほかの 4xx は送り直しても変わらないので諦める
 * （408 と 429 だけは時間を置けば通りうるので送り直す）。
 */
async function deliverTo(sub: McpEventSubscriptionRow, occurrence: Occurrence): Promise<void> {
  const body = JSON.stringify(occurrence);
  if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
    console.error('mcp-events: event payload too large', sub.id, occurrence.eventId);
    return;
  }
  for (const delay of [0, ...RETRY_DELAYS_MS]) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    const headers = webhookHeaders(sub.id, secretsOf(sub), occurrence.eventId, body);
    const response = await postWebhook(sub.url, headers, body);
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
function secretsOf(sub: McpEventSubscriptionRow): string[] {
  const { secret, previousSecret, previousSecretExpiresAt } = sub;
  return previousSecret && previousSecretExpiresAt && previousSecretExpiresAt > new Date()
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
  userId: string,
  { name, url, secret, ttlMs }: SubscribeInput,
): Promise<{ ok: true; id: string; refreshBefore: Date } | { ok: false; reason: string }> {
  const now = new Date();
  const id = subscriptionIdOf(userId, url, name);
  const [current] = await Promise.all([repository.findById(id), repository.removeExpired(now)]);
  if (!current) {
    const verified = await verifyEndpoint(id, url, secret);
    if (!verified.ok) return verified;
  }
  const ttl = Math.min(Math.max(ttlMs ?? MAX_TTL_MS, MIN_TTL_MS), MAX_TTL_MS);
  const expiresAt = new Date(now.getTime() + ttl);
  const rotated = current && current.secret !== secret;
  await repository.upsert(
    { id, userId, name, url },
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
  userId: string,
  { name, url }: { name: EventName; url: string },
): Promise<void> {
  await repository.remove(subscriptionIdOf(userId, url, name));
}
