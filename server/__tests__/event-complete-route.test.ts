import { beforeEach, describe, expect, it } from 'vitest';
import { newId } from '../../shared/id.ts';
import { app } from '../app.ts';
import { getEvent } from '../features/events/service.ts';
import { clearTables } from '../lib/test-db.ts';
import { loginAs } from './login.ts';

/**
 * タスクの完了（`POST /api/events/:id/complete`）。完了日時は押した端末が送った時刻を残す。
 * オフラインで溜めた完了を後で送っても、送り直しても、押した時刻のままになる。
 */
describe('タスクの完了', () => {
  let cookie: string;
  let userId: string;

  beforeEach(async () => {
    await clearTables();
    ({ userId, cookie } = await loginAs('A'));
  });

  const post = (path: string, body: unknown) =>
    app.request(path, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  async function createTask(): Promise<string> {
    const id = newId();
    const res = await post('/api/events', {
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
    expect(res.status).toBe(204);
    return id;
  }

  it('送られた完了日時を残し、同じ完了を送り直しても変わらない', async () => {
    const id = await createTask();
    const completedAt = '2026-09-20T01:23:45.000Z';
    expect((await post(`/api/events/${id}/complete`, { completedAt })).status).toBe(204);
    expect((await post(`/api/events/${id}/complete`, { completedAt })).status).toBe(204);
    expect((await getEvent(id)).completedAt).toBe(completedAt);
  });

  it('完了日時を省けばサーバーの今', async () => {
    const id = await createTask();
    const before = Date.now();
    expect((await post(`/api/events/${id}/complete`, {})).status).toBe(204);
    const completedAt = (await getEvent(id)).completedAt;
    expect(completedAt && Date.parse(completedAt)).toBeGreaterThanOrEqual(before - 1000);
  });
});
