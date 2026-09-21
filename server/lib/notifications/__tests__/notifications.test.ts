import { beforeEach, describe, expect, it } from 'vitest';
import { createEventSchema } from '../../../../shared/validation/events.ts';
import {
  listNotifications,
  type NotificationRef,
  type PlannedNotification,
  resolveNotification,
} from '../../../features/events/notifications.ts';
import {
  completeEvent,
  createEvent,
  deleteEvent,
  updateEvent,
} from '../../../features/events/service.ts';
import { createUser } from '../../../features/users/service.ts';
import { truncateAll } from '../../../lib/test-db.ts';
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
    const planned = await listNotifications(tomorrow);
    // 並びは一覧と同じ（同日内はその項目が示す時刻の順。タスクは期限の 17:00）
    expect(planned.map((p) => [p.key, p.at.toISOString()])).toEqual([
      [`event:${event.id}:single:start:${iso('2026-09-15T09:30:00')}`, iso('2026-09-15T09:30:00')],
      [`event:${task.id}:single:end:${iso('2026-09-15T17:00:00')}`, iso('2026-09-15T17:00:00')],
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
    const planned = await listNotifications(tomorrow);
    const eventRef = planned.find((p) => p.ref.id === event.id)?.ref as NotificationRef;
    const taskRef = planned.find((p) => p.ref.id === task.id)?.ref as NotificationRef;

    expect(await resolveNotification(eventRef)).toMatchObject({
      title: '歯医者',
      body: '開始 9/15 10:00',
      userIds: [userId],
      url: '/calendar?date=2026-09-15',
    });
    expect(await resolveNotification(taskRef)).toMatchObject({
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
    expect(await resolveNotification(eventRef)).toBeNull();
    await deleteEvent(event.id, { scope: 'all' }, userId);
    expect(await resolveNotification(eventRef)).toBeNull();

    await completeEvent(task.id, {}, userId);
    expect(await resolveNotification(taskRef)).toBeNull();
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
    const published: PlannedNotification[] = [];
    expect(
      await enqueueRange(tomorrow, { publish: async (item) => void published.push(item) }),
    ).toEqual({ planned: 1, published: 1 });
    expect(await enqueueRange(tomorrow, null)).toEqual({ planned: 1, published: 0 });

    const sent: string[] = [];
    const send = async (_: string[], m: { title: string }) => void sent.push(m.title);
    const { key, ref } = published[0] as PlannedNotification;
    expect(await deliver(key, ref, send)).toBe('sent');
    expect(await deliver(key, ref, send)).toBe('duplicate');
    expect(await deliver('event:unknown', { ...ref, id: userId }, send)).toBe('stale');
    expect(sent).toEqual(['タスク: 提出']);
  });

  it('送信に失敗したキーは送信済みにせず再試行できる', async () => {
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
    const [planned] = await listNotifications(tomorrow);
    const { key, ref } = planned as PlannedNotification;
    await expect(
      deliver(key, ref, async () => {
        throw new Error('temporary failure');
      }),
    ).rejects.toThrow('temporary failure');

    const sent: string[] = [];
    expect(
      await deliver(key, ref, async (_userIds, message) => void sent.push(message.title)),
    ).toBe('sent');
    expect(sent).toEqual(['タスク: 提出']);
  });

  it('タスクの通知は配信予定時刻の日を指す', async () => {
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
    const [planned] = await listNotifications(tomorrow);
    // 繰り越されるタスクの位置は「今日」で決まるので、再検証が 1 日前の状態を見ていると前日になる
    expect(await resolveNotification((planned as PlannedNotification).ref)).toMatchObject({
      url: '/calendar?date=2026-09-15',
    });
  });

  it('繰り返しタスクをためても、その日の回の通知は予約される', async () => {
    // 毎日 17:00 期限。9/13 から未完了のまま 9/15 を迎えても 9/15 の回の通知が要る
    await createEvent(
      createEventSchema.parse({
        kind: 'task',
        title: '薬',
        endsAt: iso('2026-09-13T17:00:00'),
        rrule: 'FREQ=DAILY',
        remindEndMinutes: 0,
        participantIds: [userId],
      }),
      userId,
    );
    const planned = await listNotifications(tomorrow);
    expect(planned.map((p) => p.at.toISOString())).toEqual([iso('2026-09-15T17:00:00')]);
    expect(await resolveNotification((planned[0] as PlannedNotification).ref)).toMatchObject({
      title: 'タスク: 薬',
      body: '期限 9/15 17:00',
      url: '/calendar?date=2026-09-15',
    });
  });
});
