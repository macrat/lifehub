import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { iso, jst } from '../../../../shared/__tests__/jst.ts';
import { createEventSchema, updateEventSchema } from '../../../../shared/validation/events.ts';
import { resetUsers } from '../../../lib/db/test-db.ts';
import * as notifications from '../../notifications/service.ts';
import { updateUser } from '../../users/service.ts';
import {
  completeEvent,
  createEvent,
  deleteEvent,
  uncompleteEvent,
  updateEvent,
} from '../service.ts';
import { now } from './service-fixtures.ts';

/**
 * 通知を増やしうる書き込みの後に、当日〜翌日の通知の予約（scheduleUpcoming）が必ず呼ばれること。
 * 日次 Cron は翌日分しか予約しないので、呼び忘れると当日の通知が届かない。
 */

let userId: string;

const task = () =>
  createEventSchema.parse({
    kind: 'task',
    title: '提出',
    startsAt: iso('2026-09-14T18:00:00'),
    participantIds: [userId],
    remindStartMinutes: 60,
  });

describe('書き込みの後の通知の予約', () => {
  let schedule: MockInstance<typeof notifications.scheduleUpcoming>;
  beforeEach(async () => {
    ({ userId } = await resetUsers());
    schedule = vi.spyOn(notifications, 'scheduleUpcoming');
  });
  afterEach(() => {
    schedule.mockRestore();
  });

  it('作成・変更で、書いた予定・タスクの通知だけを予約する', async () => {
    const created = await createEvent(task(), userId);
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenLastCalledWith({ id: created.id });
    await updateEvent(
      created.id,
      updateEventSchema.parse({ ...task(), startsAt: iso('2026-09-14T19:00:00'), scope: 'all' }),
      userId,
    );
    expect(schedule).toHaveBeenCalledTimes(2);
    expect(schedule).toHaveBeenLastCalledWith({ id: created.id });
  });

  it('完了の取り消しで予約し直す（完了していた間は日次 Cron が予約しない）', async () => {
    const created = await createEvent(task(), userId);
    await completeEvent(created.id, {}, userId, now);
    schedule.mockClear();
    await uncompleteEvent(created.id, {}, userId);
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it('通知を減らすだけの書き込み（完了・削除）では予約しない', async () => {
    const created = await createEvent(task(), userId);
    schedule.mockClear();
    await completeEvent(created.id, {}, userId, jst('2026-09-14T12:00:00'));
    await deleteEvent(created.id, { scope: 'all' }, userId);
    expect(schedule).not.toHaveBeenCalled();
  });

  it('終日の通知時刻の変更で予約し直す', async () => {
    await updateUser(userId, { allDayNotifyMinutes: 8 * 60 });
    expect(schedule).toHaveBeenCalledTimes(1);
    // すべての予定・タスクの通知時刻が変わりうるので、絞らずに予約する
    expect(schedule).toHaveBeenLastCalledWith();
    schedule.mockClear();
    await updateUser(userId, { name: '名前だけ' });
    expect(schedule).not.toHaveBeenCalled();
  });
});
