import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { dateStringSchema } from '../../../../shared/validation/common.ts';
import { createEventSchema, updateEventSchema } from '../../../../shared/validation/events.ts';
import { clearTables, createTestUser } from '../../../lib/db/test-db.ts';
import { completeEvent, createEvent, updateEvent } from '../../events/service.ts';
import { addExpense, deleteExpense, patchExpense } from '../../expenses/service.ts';
import { logCare, patchLog } from '../../lemon/service.ts';
import * as mcpEvents from '../service.ts';
import type { WebhookPost } from '../webhook.ts';

/**
 * 作った人とは別の人が直す・消したとき、知らせる data.by は直した・消した人になる。
 * service が知らせるもの（publishChanged の引数）を捕まえ、そのまま配って届いた本文を確かめる。
 * publishChanged は応答の後に本物の受け手へ送りに行くので、捕まえるだけにして配らせない。
 */

const received: { by: string; entry: Record<string, unknown> }[] = [];
const post: WebhookPost = async (_url, _headers, body) => {
  const { type, challenge, data } = JSON.parse(body);
  if (type === 'verification') return { status: 200, body: JSON.stringify({ challenge }) };
  received.push(data);
  return { status: 200, body: '' };
};

describe('別の人が直す・消したときの data.by', () => {
  let a: string;
  let b: string;
  let publish: MockInstance<typeof mcpEvents.publishChanged>;

  beforeEach(async () => {
    await clearTables();
    a = await createTestUser('A');
    b = await createTestUser('B');
    received.length = 0;
    publish = vi.spyOn(mcpEvents, 'publishChanged').mockImplementation(() => {});
    for (const name of Object.values(mcpEvents.EVENT_NAMES)) {
      const url = `https://receiver.example.com/${name}`;
      const secret = `whsec_${randomBytes(32).toString('base64')}`;
      await mcpEvents.subscribe(a, { name, url, secret }, post);
    }
  });
  afterEach(() => {
    publish.mockRestore();
  });

  /** service が最後に知らせたものを配り、届いた data を返す */
  async function lastDelivered() {
    const args = publish.mock.lastCall;
    if (!args) throw new Error('publishChanged was not called');
    received.length = 0;
    await mcpEvents.deliverChanged(...args, { post });
    return received[0];
  }

  it('立替: A が記録し、B が直す・消すと、by は B', async () => {
    const expense = await addExpense(
      {
        fromUserId: a,
        toUserId: null,
        amount: 2000,
        description: '食材',
        spentOn: dateStringSchema.parse('2026-10-01'),
      },
      a,
    );
    expect(await lastDelivered()).toMatchObject({ action: 'added', by: 'A' });

    await patchExpense(expense.id, { amount: 3000 }, b);
    expect(await lastDelivered()).toMatchObject({
      action: 'updated',
      by: 'B',
      entry: { amount: 3000, paidBy: 'A' },
    });

    await deleteExpense(expense.id, b);
    expect(await lastDelivered()).toMatchObject({ action: 'deleted', by: 'B' });
  });

  it('レモン: by は直した人で、エントリーの by は記録した人（API キーならキーの名前）のまま', async () => {
    const byA = await logCare(
      { careTypes: ['water'], doneAt: new Date('2026-10-01T00:00:00Z'), note: null },
      { userId: a },
    );
    await patchLog(byA.id, { note: '多めに' }, b);
    expect(await lastDelivered()).toMatchObject({ action: 'updated', by: 'B', entry: { by: 'A' } });

    const byKey = await logCare(
      { careTypes: ['mist'], doneAt: new Date('2026-10-01T01:00:00Z'), note: null },
      { apiKeyName: 'ボタン' },
    );
    expect(await lastDelivered()).toMatchObject({ action: 'added', by: 'API キー「ボタン」' });
    await patchLog(byKey.id, { note: '直した' }, b);
    expect(await lastDelivered()).toMatchObject({
      by: 'B',
      entry: { by: 'API キー「ボタン」' },
    });
  });

  it('予定・タスク: A が作り、B が変える・完了にすると、by は B', async () => {
    const input = {
      kind: 'task',
      title: '提出',
      endsAt: '2026-10-05T09:00:00Z',
      participantIds: [a],
    };
    const task = await createEvent(createEventSchema.parse(input), a);
    expect(await lastDelivered()).toMatchObject({ action: 'added', by: 'A' });

    await updateEvent(
      task.id,
      updateEventSchema.parse({ ...input, title: '再提出', scope: 'all' }),
      b,
    );
    expect(await lastDelivered()).toMatchObject({
      action: 'updated',
      by: 'B',
      entry: { title: '再提出', participants: ['A'] },
    });

    await completeEvent(task.id, {}, b);
    expect(await lastDelivered()).toMatchObject({ by: 'B', entry: { done: true } });
  });
});
