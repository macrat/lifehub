import { beforeEach, describe, expect, it } from 'vitest';
import { newId } from '../../shared/id.ts';
import { getEvent } from '../features/events/service.ts';
import { clearTables } from '../lib/db/test-db.ts';
import { apiClient, loginAs } from './login.ts';

/**
 * タスクの完了（`events.complete`）。完了日時は押した端末が送った時刻を残す。
 * オフラインで溜めた完了を後で送っても、送り直しても、押した時刻のままになる。
 */
describe('タスクの完了', () => {
  let api: ReturnType<typeof apiClient>;
  let userId: string;

  beforeEach(async () => {
    await clearTables();
    let cookie: string;
    ({ userId, cookie } = await loginAs('A'));
    api = apiClient(cookie);
  });

  async function createTask(): Promise<string> {
    const id = newId();
    await api.events.create.mutate({
      id,
      kind: 'task',
      title: '書類を出す',
      allDay: false,
      startsAt: null,
      endsAt: null,
      participantIds: [userId],
      location: null,
      note: null,
      rrule: null,
      remindStartMinutes: null,
      remindEndMinutes: null,
    });
    return id;
  }

  it('送られた完了日時を残し、同じ完了を送り直しても変わらない', async () => {
    const id = await createTask();
    const completedAt = '2026-09-20T01:23:45.000Z';
    await api.events.complete.mutate({ id, completedAt });
    await api.events.complete.mutate({ id, completedAt });
    expect((await getEvent(id)).completedAt).toBe(completedAt);
  });

  it('完了日時を省けばサーバーの今', async () => {
    const id = await createTask();
    const before = Date.now();
    await api.events.complete.mutate({ id });
    const completedAt = (await getEvent(id)).completedAt;
    expect(completedAt && Date.parse(completedAt)).toBeGreaterThanOrEqual(before - 1000);
  });
});
