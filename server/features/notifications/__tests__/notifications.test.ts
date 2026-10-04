import { beforeEach, describe, expect, it } from 'vitest';
import { iso, jst } from '../../../../shared/__tests__/jst.ts';
import { createEventSchema } from '../../../../shared/validation/events.ts';
import { clearTables, createTestUser } from '../../../lib/db/test-db.ts';
import {
  listNotifications,
  type NotificationRef,
  type PlannedNotification,
  resolveNotification,
} from '../../events/notifications.ts';
import { completeEvent, createEvent, deleteEvent, updateEvent } from '../../events/service.ts';
import { listAllDayNotifyMinutes as notifyTimes } from '../../users/people.ts';
import { updateUser } from '../../users/service.ts';
import { deliver, enqueueRange } from '../service.ts';

const tomorrow = { from: jst('2026-09-15T00:00:00'), to: jst('2026-09-16T00:00:00') };

let userId: string;

describe('notifications', () => {
  beforeEach(async () => {
    await clearTables();
    userId = await createTestUser('A');
  });

  it('予定の開始 N 分前と、タスクの開始を列挙する', async () => {
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
        startsAt: iso('2026-09-15T17:00:00'),
        remindStartMinutes: 0,
        participantIds: [userId],
      }),
      userId,
    );
    const planned = await listNotifications(tomorrow, await notifyTimes());
    // 並びは一覧と同じ（同日内はその項目が示す時刻の順）
    expect(planned.map((p) => [p.key, p.at.toISOString()])).toEqual([
      [`event:${event.id}:single:start:${iso('2026-09-15T09:30:00')}`, iso('2026-09-15T09:30:00')],
      [`event:${task.id}:single:start:${iso('2026-09-15T17:00:00')}`, iso('2026-09-15T17:00:00')],
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
        startsAt: iso('2026-09-15T17:00:00'),
        remindStartMinutes: 0,
        participantIds: [userId],
      }),
      userId,
    );
    const planned = await listNotifications(tomorrow, await notifyTimes());
    const eventRef = planned.find((p) => p.ref.id === event.id)?.ref as NotificationRef;
    const taskRef = planned.find((p) => p.ref.id === task.id)?.ref as NotificationRef;

    expect(await resolveNotification(eventRef, await notifyTimes())).toMatchObject({
      title: '歯医者',
      body: '開始 9/15 10:00',
      userIds: [userId],
      url: '/calendar?date=2026-09-15',
    });
    expect(await resolveNotification(taskRef, await notifyTimes())).toMatchObject({
      title: 'タスク: 提出',
      body: '開始 9/15 17:00',
      url: '/calendar?date=2026-09-15',
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
    expect(await resolveNotification(eventRef, await notifyTimes())).toBeNull();
    await deleteEvent(event.id, { scope: 'all' }, userId);
    expect(await resolveNotification(eventRef, await notifyTimes())).toBeNull();

    await completeEvent(task.id, {}, userId);
    expect(await resolveNotification(taskRef, await notifyTimes())).toBeNull();
  });

  it('同じキーは一度しか送らず、予約先が無ければ列挙だけする', async () => {
    await createEvent(
      createEventSchema.parse({
        kind: 'task',
        title: '提出',
        startsAt: iso('2026-09-15T17:00:00'),
        remindStartMinutes: 0,
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
        startsAt: iso('2026-09-15T17:00:00'),
        remindStartMinutes: 0,
        participantIds: [userId],
      }),
      userId,
    );
    const [planned] = await listNotifications(tomorrow, await notifyTimes());
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

  it('送る内容を読めなかった（DB の失敗など）キーも送信済みにせず再試行できる', async () => {
    await createEvent(
      createEventSchema.parse({
        kind: 'task',
        title: '提出',
        startsAt: iso('2026-09-15T17:00:00'),
        remindStartMinutes: 0,
        participantIds: [userId],
      }),
      userId,
    );
    const [planned] = await listNotifications(tomorrow, await notifyTimes());
    const { key, ref } = planned as PlannedNotification;
    const sent: string[] = [];
    const send = async (_: string[], m: { title: string }) => void sent.push(m.title);
    // 不正な日時は読み出しの問い合わせを組み立てる所で例外になるので、読み出しの失敗をモック無しで起こせる
    await expect(deliver(key, { ...ref, at: new Date(Number.NaN) }, send)).rejects.toThrow();

    expect(await deliver(key, ref, send)).toBe('sent');
    expect(sent).toEqual(['タスク: 提出']);
  });

  it('繰り返しタスクをためても、その日の回の通知は予約される', async () => {
    // 毎日 17:00 開始。9/13 から未完了のまま 9/15 を迎えても 9/15 の回の通知が要る
    await createEvent(
      createEventSchema.parse({
        kind: 'task',
        title: '薬',
        startsAt: iso('2026-09-13T17:00:00'),
        rrule: 'FREQ=DAILY',
        remindStartMinutes: 0,
        participantIds: [userId],
      }),
      userId,
    );
    const planned = await listNotifications(tomorrow, await notifyTimes());
    expect(planned.map((p) => p.at.toISOString())).toEqual([iso('2026-09-15T17:00:00')]);
    expect(
      await resolveNotification((planned[0] as PlannedNotification).ref, await notifyTimes()),
    ).toMatchObject({
      title: 'タスク: 薬',
      body: '開始 9/15 17:00',
      url: '/calendar?date=2026-09-15',
    });
  });

  it('終日の項目は参加者それぞれの通知時刻に送る（既定は 7:00、前日も選べる）', async () => {
    const other = await createTestUser('B');
    await updateUser(other, { allDayNotifyMinutes: 8 * 60 + 30 }, other);
    const task = await createEvent(
      createEventSchema.parse({
        kind: 'task',
        title: 'ゴミ出し',
        allDay: true,
        startsAt: iso('2026-09-15T00:00:00'),
        remindStartMinutes: 0,
        participantIds: [userId, other],
      }),
      userId,
    );
    const event = await createEvent(
      createEventSchema.parse({
        kind: 'event',
        title: '旅行',
        allDay: true,
        startsAt: iso('2026-09-16T00:00:00'),
        endsAt: iso('2026-09-17T00:00:00'),
        remindStartMinutes: 1440,
        participantIds: [userId],
      }),
      userId,
    );
    const planned = await listNotifications(tomorrow, await notifyTimes());
    expect(planned.map((p) => [p.ref.id, p.ref.userId, p.at.toISOString()])).toEqual([
      [task.id, userId, iso('2026-09-15T07:00:00')],
      [task.id, other, iso('2026-09-15T08:30:00')],
      [event.id, userId, iso('2026-09-15T07:00:00')],
    ]);
    const [mine, theirs, trip] = planned.map((p) => p.ref) as NotificationRef[];
    expect(await resolveNotification(theirs as NotificationRef, await notifyTimes())).toMatchObject(
      {
        title: 'タスク: ゴミ出し',
        body: '開始 9/15 終日',
        userIds: [other],
        url: '/calendar?date=2026-09-15',
      },
    );
    expect(await resolveNotification(trip as NotificationRef, await notifyTimes())).toMatchObject({
      title: '旅行',
      body: '開始 9/16 終日',
      userIds: [userId],
    });

    // 通知時刻を変えると古い予約は送らない
    await updateUser(userId, { allDayNotifyMinutes: 6 * 60 }, userId);
    expect(await resolveNotification(mine as NotificationRef, await notifyTimes())).toBeNull();
    expect(
      await resolveNotification(theirs as NotificationRef, await notifyTimes()),
    ).not.toBeNull();
  });
});
