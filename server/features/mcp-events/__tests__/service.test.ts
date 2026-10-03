import { randomBytes } from 'node:crypto';
import { Webhook } from 'standardwebhooks';
import { beforeEach, describe, expect, it } from 'vitest';
import { createEventSchema } from '../../../../shared/validation/events.ts';
import { clearTables, createTestUser } from '../../../lib/db/test-db.ts';
import { createEvent } from '../../events/service.ts';
import { addMemo } from '../../memos/service.ts';
import { deliverChanged, subscribe, unsubscribe } from '../service.ts';
import type { WebhookPost } from '../webhook.ts';

const URL_A = 'https://receiver.example.com/hooks/a';
const newSecret = () => `whsec_${randomBytes(32).toString('base64')}`;

type Received = { url: string; headers: Record<string, string>; body: string };

/** 受け手の代わり。届いたものを覚え、検証の challenge には同じ値を返す（status で返す応答を変えられる） */
function receiver(status: (received: Received) => number = () => 200) {
  const received: Received[] = [];
  const post: WebhookPost = async (url, headers, body) => {
    const request = { url, headers, body };
    received.push(request);
    const { type, challenge } = JSON.parse(body) as { type?: string; challenge?: string };
    return {
      status: status(request),
      body: type === 'verification' ? JSON.stringify({ challenge }) : '',
    };
  };
  const events = () => received.filter((r) => !r.body.includes('"verification"'));
  return { post, received, events };
}

/**
 * 記録は購読より先に作る（購読がある間に service で書くと、応答の後の配信が本物の受け手へ送りに行く）。
 * 配信は deliverChanged に受け手を渡して確かめる。
 */
describe('MCP Events の購読と配信', () => {
  let userId: string;
  beforeEach(async () => {
    await clearTables();
    userId = await createTestUser('A');
  });

  it('初めての購読は受け手を challenge で確かめ、署名付きで送る', async () => {
    const { post, received } = receiver();
    const secret = newSecret();
    const result = await subscribe(
      userId,
      { name: 'memo.changed', url: URL_A, secret, ttlMs: 60 * 60 * 1000 },
      post,
    );
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
    const post: WebhookPost = async () => ({ status: 200, body: '{}' });
    const secret = newSecret();
    expect(await subscribe(userId, { name: 'memo.changed', url: URL_A, secret }, post)).toEqual({
      ok: false,
      reason: 'challenge_failed',
    });
    const memo = await addMemo({ body: '牛乳' }, userId);
    const { post: watch, events } = receiver();
    await deliverChanged({ type: 'memo', record: memo }, 'added', { userId }, { post: watch });
    expect(events()).toEqual([]);
  });

  it('購読した種類の記録だけを、ツールと同じ形のエントリーで届ける', async () => {
    const memo = await addMemo({ body: '牛乳を買う' }, userId);
    const { post, events } = receiver();
    await subscribe(userId, { name: 'memo.changed', url: URL_A, secret: newSecret() }, post);
    await subscribe(
      userId,
      { name: 'expense.changed', url: `${URL_A}/expense`, secret: newSecret() },
      post,
    );

    await deliverChanged({ type: 'memo', record: memo }, 'added', { userId }, { post });
    await deliverChanged({ type: 'memo', record: memo }, 'updated', { userId }, { post });
    await deliverChanged({ type: 'memo', record: memo }, 'deleted', { userId }, { post });
    await deliverChanged(
      { type: 'lemon', record: lemonLog() },
      'added',
      { apiKeyName: 'ボタン' },
      { post },
    );

    const [added, updated, deleted] = events();
    expect(events()).toHaveLength(3);
    expect(added?.url).toBe(URL_A);
    expect(JSON.parse(added?.body ?? '')).toEqual({
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
    expect(JSON.parse(updated?.body ?? '')).toMatchObject({ data: { action: 'updated' } });
    expect(updated?.headers['webhook-id']).not.toBe(added?.headers['webhook-id']);
    // 削除は消す前のエントリーを届け、追加と同じく記録ごとに 1 度きりの eventId
    expect(JSON.parse(deleted?.body ?? '')).toMatchObject({
      eventId: `evt_deleted_memo:${memo.id}`,
      data: { action: 'deleted', by: 'A', entry: { ref: `memo:${memo.id}`, body: '牛乳を買う' } },
    });
  });

  it('繰り返しの回を消したときは、その回のエントリーと消した範囲を届ける', async () => {
    const series = await createEvent(
      createEventSchema.parse({
        kind: 'event',
        title: '歯医者',
        startsAt: '2030-01-07T00:00:00Z',
        endsAt: '2030-01-07T01:00:00Z',
        rrule: 'FREQ=WEEKLY',
        participantIds: [userId],
      }),
      userId,
    );
    const { post, events } = receiver();
    await subscribe(userId, { name: 'event.changed', url: URL_A, secret: newSecret() }, post);
    const occurrenceStart = '2030-01-14T00:00:00.000Z';
    const record = {
      ...series,
      startsAt: occurrenceStart,
      endsAt: '2030-01-14T01:00:00.000Z',
      occurrenceStart,
    };

    await deliverChanged(
      { type: 'event', record, scope: 'following' },
      'deleted',
      { userId },
      { post },
    );

    const ref = `event:${series.id}@${occurrenceStart}`;
    expect(JSON.parse(events()[0]?.body ?? '')).toMatchObject({
      eventId: `evt_deleted_${ref}`,
      name: 'event.changed',
      data: { action: 'deleted', scope: 'following', entry: { ref, title: '歯医者' } },
    });
  });

  it('購読し直しは確かめ直さず、鍵が変わればしばらく両方の鍵で署名する', async () => {
    const memo = await addMemo({ body: '牛乳' }, userId);
    const { post, received, events } = receiver();
    const [oldSecret, newerSecret] = [newSecret(), newSecret()];
    await subscribe(userId, { name: 'memo.changed', url: URL_A, secret: oldSecret }, post);
    const again = await subscribe(
      userId,
      { name: 'memo.changed', url: URL_A, secret: newerSecret },
      post,
    );
    expect(again.ok).toBe(true);
    expect(received).toHaveLength(1);

    await deliverChanged({ type: 'memo', record: memo }, 'added', { userId }, { post });
    const [event] = events();
    for (const secret of [oldSecret, newerSecret]) {
      expect(() =>
        new Webhook(secret).verify(event?.body ?? '', event?.headers ?? {}),
      ).not.toThrow();
    }
  });

  it('5xx は同じ eventId で送り直し、410 は購読を消し、ほかの 4xx は諦める', async () => {
    const memo = await addMemo({ body: '牛乳' }, userId);
    const deliver = (post: WebhookPost) =>
      deliverChanged(
        { type: 'memo', record: memo },
        'updated',
        { userId },
        {
          post,
          retryDelaysMs: [1, 1],
        },
      );

    const statuses = [503, 200];
    const flaky = receiver((r) =>
      r.body.includes('"verification"') ? 200 : (statuses.shift() ?? 200),
    );
    await subscribe(userId, { name: 'memo.changed', url: URL_A, secret: newSecret() }, flaky.post);
    await deliver(flaky.post);
    const [first, second] = flaky.events();
    expect(flaky.events()).toHaveLength(2);
    expect(second?.headers['webhook-id']).toBe(first?.headers['webhook-id']);

    const rejecting = receiver(() => 400);
    await deliver(rejecting.post);
    expect(rejecting.events()).toHaveLength(1);

    const gone = receiver(() => 410);
    await deliver(gone.post);
    await deliver(gone.post);
    expect(gone.events()).toHaveLength(1);
  });

  it('購読をやめると届かず、無い購読をやめても失敗しない', async () => {
    const { post, events } = receiver();
    await subscribe(userId, { name: 'memo.changed', url: URL_A, secret: newSecret() }, post);
    await unsubscribe(userId, { name: 'memo.changed', url: URL_A });
    await unsubscribe(userId, { name: 'memo.changed', url: URL_A });
    const memo = await addMemo({ body: '牛乳' }, userId);
    await deliverChanged({ type: 'memo', record: memo }, 'added', { userId }, { post });
    expect(events()).toEqual([]);
  });
});

function lemonLog() {
  return {
    id: '01900000-0000-7000-8000-000000000000',
    careTypes: ['water' as const],
    doneAt: new Date().toISOString(),
    note: null,
    createdBy: null,
    apiKeyName: 'ボタン',
  };
}
