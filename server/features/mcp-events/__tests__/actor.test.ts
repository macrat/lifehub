import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iso, jst } from '../../../../shared/__tests__/jst.ts';
import { dateStringSchema } from '../../../../shared/validation/common.ts';
import { createEventSchema, updateEventSchema } from '../../../../shared/validation/events.ts';
import { resetUsers } from '../../../lib/db/test-db.ts';
import { completeEvent, createEvent, updateEvent } from '../../events/service.ts';
import { addExpense, deleteExpense, patchExpense } from '../../expenses/service.ts';
import { logCare, patchLog } from '../../lemon/service.ts';
import { type EventName, subscribe } from '../service.ts';
import { holdDeliveries, newSecret, receiver } from './fixtures.ts';

/**
 * 作った人とは別の人が直す・消したとき、知らせる data.by は直した・消した人になる。
 * 直した人を渡すのは各 service なので、service を通して書き、受け手に届いた本文を確かめる。
 */
describe('別の人が直す・消したときの data.by', () => {
  let a: string;
  let b: string;
  let deliver: () => Promise<void>;
  let events: ReturnType<typeof receiver>['events'];

  beforeEach(async () => {
    ({ userId: a, partnerId: b } = await resetUsers());
    deliver = holdDeliveries();
    ({ events } = receiver());
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** 試す種類のイベントを購読する */
  async function subscribeTo(name: EventName) {
    await subscribe(a, { name, url: 'https://receiver.example.com/hook', secret: newSecret() });
  }

  /** 書いた後の配信を待ち、最後に届いた data を返す */
  async function lastDelivered() {
    await deliver();
    return events().at(-1)?.json.data;
  }

  it('立替: A が記録し、B が直す・消すと、by は B', async () => {
    await subscribeTo('expense.changed');
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
    await subscribeTo('lemon.changed');
    const byA = await logCare(
      { careTypes: ['water'], doneAt: jst('2026-10-01T09:00:00'), note: null },
      { userId: a },
    );
    await patchLog(byA.id, { note: '多めに' }, b);
    expect(await lastDelivered()).toMatchObject({ action: 'updated', by: 'B', entry: { by: 'A' } });

    const byKey = await logCare(
      { careTypes: ['mist'], doneAt: jst('2026-10-01T10:00:00'), note: null },
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
    await subscribeTo('event.changed');
    const input = {
      kind: 'task',
      title: '提出',
      endsAt: iso('2026-10-05T18:00:00'),
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
