import { Webhook } from 'standardwebhooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iso, jst } from '../../../../shared/__tests__/jst.ts';
import { createEventSchema } from '../../../../shared/validation/events.ts';
import { clearTables, createTestUser } from '../../../lib/db/test-db.ts';
import type { PlannedNotification } from '../../events/notifications.ts';
import { createEvent, deleteEvent } from '../../events/service.ts';
import { logCare } from '../../lemon/service.ts';
import { addMemo, deleteMemo, updateMemo } from '../../memos/service.ts';
import { deliver as deliverNotification, enqueueRange } from '../../notifications/service.ts';
import { subscribe, unsubscribe } from '../subscriptions.ts';
import * as webhook from '../webhook.ts';
import { holdDeliveries, newSecret, receiver, subscriber } from './fixtures.ts';

const URL_A = 'https://receiver.example.com/hooks/a';

/** 記録を書く service を通し、応答の後の配信を待って、受け手に届いた本文を確かめる */
describe('MCP Events の購読と配信', () => {
  let userId: string;
  let deliver: () => Promise<void>;
  beforeEach(async () => {
    await clearTables();
    userId = await createTestUser('A');
    deliver = holdDeliveries();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('初めての購読は受け手を challenge で確かめ、署名付きで送る', async () => {
    const { received } = receiver();
    const secret = newSecret();
    const result = await subscribe(subscriber(userId), {
      name: 'memo.changed',
      url: URL_A,
      secret,
      ttlMs: 60 * 60 * 1000,
    });
    expect(result).toMatchObject({ ok: true, id: expect.stringMatching(/^sub_/) });
    const [verification] = received;
    expect(JSON.parse(verification?.body ?? '')).toMatchObject({ type: 'verification' });
    expect(verification?.headers['x-mcp-subscription-id']).toBe(result.ok && result.id);
    // 受け手が Standard Webhooks の手順で確かめられる
    expect(() =>
      new Webhook(secret).verify(verification?.body ?? '', verification?.headers ?? {}),
    ).not.toThrow();
  });

  it('challenge を返さない受け手は購読できず、送られない', async () => {
    const post = vi.spyOn(webhook, 'postWebhook').mockResolvedValue({ status: 200, body: '{}' });
    expect(
      await subscribe(subscriber(userId), {
        name: 'memo.changed',
        url: URL_A,
        secret: newSecret(),
      }),
    ).toEqual({ ok: false, reason: 'challenge_failed' });
    await addMemo({ body: '牛乳' }, { userId });
    await deliver();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('購読した種類の記録の追加・編集・削除を、ツールと同じ形のエントリーで届ける', async () => {
    const { events } = receiver();
    await subscribe(subscriber(userId), { name: 'memo.changed', url: URL_A, secret: newSecret() });
    await subscribe(subscriber(userId), {
      name: 'expense.changed',
      url: URL_A,
      secret: newSecret(),
    });

    const memo = await addMemo({ body: '牛乳を買う' }, { userId });
    await updateMemo(memo.id, { body: '牛乳を 2 本買う' }, userId);
    await deleteMemo(memo.id, userId);
    // 購読していない種類は届かない
    await logCare(
      { careTypes: ['water'], doneAt: jst('2026-10-01T09:00:00'), note: null },
      { apiKeyName: 'ボタン' },
    );
    await deliver();

    const [added, updated, deleted] = events();
    expect(events()).toHaveLength(3);
    expect(added?.url).toBe(URL_A);
    expect(added?.json).toEqual({
      eventId: `evt_added_memo:${memo.id}`,
      name: 'memo.changed',
      timestamp: expect.any(String),
      data: {
        action: 'added',
        by: 'A',
        entry: {
          ref: `memo:${memo.id}`,
          type: 'memo',
          at: expect.any(String),
          body: '牛乳を買う',
          by: 'A',
        },
      },
      cursor: null,
    });
    expect(added?.headers['webhook-id']).toBe(`evt_added_memo:${memo.id}`);
    // 編集は毎回別の出来事なので、別の eventId
    expect(updated?.json).toMatchObject({
      data: { action: 'updated', entry: { body: '牛乳を 2 本買う' } },
    });
    expect(updated?.headers['webhook-id']).not.toBe(added?.headers['webhook-id']);
    // 削除は消す前のエントリーを届け、追加と同じく記録ごとに 1 度きりの eventId
    expect(deleted?.json).toMatchObject({
      eventId: `evt_deleted_memo:${memo.id}`,
      data: { action: 'deleted', by: 'A', entry: { ref: `memo:${memo.id}` } },
    });
  });

  it('繰り返しの回を消したときは、その回のエントリーと消した範囲を届ける', async () => {
    const { events } = receiver();
    await subscribe(subscriber(userId), { name: 'event.changed', url: URL_A, secret: newSecret() });
    const series = await createEvent(
      createEventSchema.parse({
        kind: 'event',
        title: '歯医者',
        startsAt: iso('2030-01-07T09:00:00'),
        endsAt: iso('2030-01-07T10:00:00'),
        rrule: 'FREQ=WEEKLY',
        participantIds: [userId],
      }),
      userId,
    );
    const [second, third] = [jst('2030-01-14T09:00:00'), jst('2030-01-21T09:00:00')];
    await deleteEvent(series.id, { scope: 'this', occurrenceStart: second }, userId);
    await deleteEvent(series.id, { scope: 'following', occurrenceStart: third }, userId);
    await deliver();

    const refOf = (at: Date) => `event:${series.id}@${at.toISOString()}`;
    expect(events().map((e) => e.json.data)).toMatchObject([
      { action: 'added', entry: { ref: `event:${series.id}`, repeat: 'FREQ=WEEKLY' } },
      { action: 'deleted', scope: 'this', entry: { ref: refOf(second), title: '歯医者' } },
      { action: 'deleted', scope: 'following', entry: { ref: refOf(third), title: '歯医者' } },
    ]);
    expect(events()[2]?.json.eventId).toBe(`evt_deleted_${refOf(third)}`);
  });

  it('プッシュ通知を送ったとき、同じ宛先の購読に通知した予定・タスクを届ける', async () => {
    const { events } = receiver();
    const partnerId = await createTestUser('B');
    await subscribe(subscriber(userId), {
      name: 'event.reminder',
      url: URL_A,
      secret: newSecret(),
    });
    await subscribe(subscriber(partnerId), {
      name: 'event.reminder',
      url: URL_A,
      secret: newSecret(),
    });
    const task = await createEvent(
      createEventSchema.parse({
        kind: 'task',
        title: '提出',
        startsAt: iso('2026-09-15T17:00:00'),
        remindStartMinutes: 0,
        participantIds: [userId],
      }),
      userId,
    );
    const planned: PlannedNotification[] = [];
    await enqueueRange(
      { from: jst('2026-09-15T00:00:00'), to: jst('2026-09-16T00:00:00') },
      { publish: async (item) => void planned.push(item) },
    );
    const { key, ref } = planned[0] as PlannedNotification;
    // プッシュの送信に失敗したときは配らない（QStash が送り直すときに配る）
    const failing = async () => {
      throw new Error('temporary failure');
    };
    await expect(deliverNotification(key, ref, failing)).rejects.toThrow();
    await deliver();
    expect(events().filter((e) => e.json.name === 'event.reminder')).toEqual([]);

    expect(await deliverNotification(key, ref, async () => {})).toBe('sent');
    await deliver();
    const reminders = events().filter((e) => e.json.name === 'event.reminder');
    // 宛先（参加者）でない B の購読には届かない
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.headers['x-mcp-subscription-id']).toMatch(/^sub_/);
    expect(reminders[0]?.json).toEqual({
      eventId: `evt_reminder_${key}`,
      name: 'event.reminder',
      timestamp: expect.any(String),
      data: {
        about: 'start',
        entry: expect.objectContaining({ ref: `task:${task.id}`, type: 'task', title: '提出' }),
      },
      cursor: null,
    });
  });

  it('購読し直しは確かめ直さず、鍵が変わればしばらく両方の鍵で署名する', async () => {
    const { received, events } = receiver();
    const [oldSecret, newerSecret] = [newSecret(), newSecret()];
    await subscribe(subscriber(userId), { name: 'memo.changed', url: URL_A, secret: oldSecret });
    const again = await subscribe(subscriber(userId), {
      name: 'memo.changed',
      url: URL_A,
      secret: newerSecret,
    });
    expect(again.ok).toBe(true);
    expect(received).toHaveLength(1);

    await addMemo({ body: '牛乳' }, { userId });
    await deliver();
    const [event] = events();
    for (const secret of [oldSecret, newerSecret]) {
      expect(() =>
        new Webhook(secret).verify(event?.body ?? '', event?.headers ?? {}),
      ).not.toThrow();
    }
  });

  it('5xx は同じ eventId で送り直し、410 は購読を消し、ほかの 4xx は諦める', async () => {
    const statuses = [503, 200];
    const flaky = receiver((r) =>
      r.body.includes('"verification"') ? 200 : (statuses.shift() ?? 200),
    );
    await subscribe(subscriber(userId), { name: 'memo.changed', url: URL_A, secret: newSecret() });
    const memo = await addMemo({ body: '牛乳' }, { userId });
    // 送り直しの間（数秒）はフェイクタイマーで飛ばす。1 度目が届いてから、送り直すまでの時間を進める
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const delivering = deliver();
    await vi.waitFor(() => expect(flaky.events()).toHaveLength(1), { interval: 5 });
    await vi.advanceTimersByTimeAsync(2_000);
    await delivering;
    vi.useRealTimers();
    const [first, second] = flaky.events();
    expect(second?.headers['webhook-id']).toBe(first?.headers['webhook-id']);

    const rejecting = receiver(() => 400);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    await updateMemo(memo.id, { body: '牛乳 2 本' }, userId);
    await deliver();
    expect(rejecting.events()).toHaveLength(1);
    expect(logged).toHaveBeenCalledWith(
      'mcp-events: delivery failed',
      expect.any(String),
      expect.any(String),
    );

    const gone = receiver(() => 410);
    await updateMemo(memo.id, { body: '牛乳 3 本' }, userId);
    await updateMemo(memo.id, { body: '牛乳 4 本' }, userId);
    await deliver();
    expect(gone.events()).toHaveLength(1);
  });

  it('購読をやめると届かず、無い購読をやめても失敗しない', async () => {
    const { events } = receiver();
    await subscribe(subscriber(userId), { name: 'memo.changed', url: URL_A, secret: newSecret() });
    await unsubscribe(subscriber(userId), { name: 'memo.changed', url: URL_A });
    await unsubscribe(subscriber(userId), { name: 'memo.changed', url: URL_A });
    await addMemo({ body: '牛乳' }, { userId });
    await deliver();
    expect(events()).toEqual([]);
  });
});
