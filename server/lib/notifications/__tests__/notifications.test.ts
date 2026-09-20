import { beforeEach, describe, expect, it } from 'vitest';
import { createEventSchema } from '../../../../shared/validation/events.ts';
import {
  completeEvent,
  createEvent,
  deleteEvent,
  updateEvent,
} from '../../../features/events/service.ts';
import { createUser } from '../../../features/users/service.ts';
import { truncateAll } from '../../../lib/test-db.ts';
import { listAll, resolve } from '../registry.ts';
import { deliver, enqueueRange } from '../service.ts';

const jst = (s: string) => new Date(`${s}+09:00`);
const iso = (s: string) => jst(s).toISOString();
const tomorrow = { from: jst('2026-09-15T00:00:00'), to: jst('2026-09-16T00:00:00') };

let userId: string;

describe('notifications', () => {
  beforeEach(async () => {
    await truncateAll();
    userId = (await createUser({ email: 'a@example.com', name: 'A', password: 'password-123456' }))
      .id;
  });

  it('予定の開始 N 分前と、タスクの開始・期限を列挙する', async () => {
    const event = await createEvent(
      createEventSchema.parse({
        kind: 'event',
        title: '歯医者',
        startsAt: iso('2026-09-15T10:00:00'),
        endsAt: iso('2026-09-15T11:00:00'),
        remindStartMinutes: 30,
        participantIds: [userId],
      }),
      userId,
    );
    await createEvent(
      createEventSchema.parse({
        kind: 'event',
        title: '通知なし',
        startsAt: iso('2026-09-15T12:00:00'),
        endsAt: iso('2026-09-15T13:00:00'),
        participantIds: [userId],
      }),
      userId,
    );
    const task = await createEvent(
      createEventSchema.parse({
        kind: 'task',
        title: '提出',
        startsAt: iso('2026-09-14T09:00:00'),
        endsAt: iso('2026-09-15T17:00:00'),
        remindStartMinutes: 0,
        remindEndMinutes: 0,
        participantIds: [userId],
      }),
      userId,
    );
    const planned = await listAll(tomorrow);
    expect(planned.map((p) => [p.key, p.at.toISOString()])).toEqual([
      [`event:${task.id}:single:end:${iso('2026-09-15T17:00:00')}`, iso('2026-09-15T17:00:00')],
      [`event:${event.id}:single:start:${iso('2026-09-15T09:30:00')}`, iso('2026-09-15T09:30:00')],
    ]);
  });

  it('配信時に再検証し、削除・変更・完了済みなら送らない', async () => {
    const input = createEventSchema.parse({
      kind: 'event',
      title: '歯医者',
      startsAt: iso('2026-09-15T10:00:00'),
      endsAt: iso('2026-09-15T11:00:00'),
      remindStartMinutes: 30,
      participantIds: [userId],
    });
    const event = await createEvent(input, userId);
    const task = await createEvent(
      createEventSchema.parse({
        kind: 'task',
        title: '提出',
        endsAt: iso('2026-09-15T17:00:00'),
        remindEndMinutes: 0,
        participantIds: [userId],
      }),
      userId,
    );
    const keys = (await listAll(tomorrow)).map((p) => p.key);
    const eventKey = keys.find((k) => k.includes(event.id)) as string;
    const taskKey = keys.find((k) => k.includes(task.id)) as string;

    expect(await resolve(eventKey)).toMatchObject({
      title: '歯医者',
      body: '開始 9/15 10:00',
      userIds: [userId],
      url: '/calendar?date=2026-09-15',
    });
    expect(await resolve(taskKey)).toMatchObject({
      title: 'タスク: 提出',
      body: '期限 9/15 17:00',
    });

    // 開始時刻を変えると配信時刻がずれるので、古い予約は送らない
    await updateEvent(
      event.id,
      {
        ...input,
        startsAt: jst('2026-09-15T11:00:00'),
        endsAt: jst('2026-09-15T12:00:00'),
        scope: 'all',
      },
      userId,
    );
    expect(await resolve(eventKey)).toBeNull();
    await deleteEvent(event.id, { scope: 'all' }, userId);
    expect(await resolve(eventKey)).toBeNull();

    await completeEvent(task.id, {}, userId);
    expect(await resolve(taskKey)).toBeNull();
  });

  it('同じキーは一度しか送らず、予約先が無ければ列挙だけする', async () => {
    await createEvent(
      createEventSchema.parse({
        kind: 'task',
        title: '提出',
        endsAt: iso('2026-09-15T17:00:00'),
        remindEndMinutes: 0,
        participantIds: [userId],
      }),
      userId,
    );
    const published: string[] = [];
    expect(
      await enqueueRange(tomorrow, { publish: async ({ key }) => void published.push(key) }),
    ).toEqual({ planned: 1, published: 1 });
    expect(await enqueueRange(tomorrow, null)).toEqual({ planned: 1, published: 0 });

    const sent: string[] = [];
    const send = async (_: string[], m: { title: string }) => void sent.push(m.title);
    const key = published[0] as string;
    expect(await deliver(key, send)).toBe('sent');
    expect(await deliver(key, send)).toBe('duplicate');
    expect(await deliver('event:unknown', send)).toBe('stale');
    expect(sent).toEqual(['タスク: 提出']);
  });
});
