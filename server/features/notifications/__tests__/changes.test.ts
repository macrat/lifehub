import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import webpush from 'web-push';
import { iso, jst } from '../../../../shared/__tests__/jst.ts';
import type { PushMessage } from '../../../../shared/push.ts';
import { createEventSchema } from '../../../../shared/validation/events.ts';
import { resetUsers } from '../../../lib/db/test-db.ts';
import { env } from '../../../lib/env.ts';
import { createEvent, deleteEvent } from '../../events/service.ts';
import { subscribe } from '../../push/service.ts';

const keys = { p256dh: 'test', auth: 'test' };
const endpointOf = (userId: string) => `https://fcm.googleapis.com/fcm/send/${userId}`;

describe('予定・タスクの追加・削除の通知', () => {
  let me: string;
  let partner: string;
  /** 端末（endpoint）ごとに届いた通知 */
  let received: { endpoint: string; message: PushMessage }[];
  const vapid = {
    VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY,
  };

  beforeEach(async () => {
    ({ userId: me, partnerId: partner } = await resetUsers());
    // 「今日」を 2026-09-14 の正午に固定する（DB の待ち合わせのタイマーは本物のまま）
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(jst('2026-09-14T12:00:00'));
    // 送信は外へ出さない。鍵の設定は形の検査だけなので止める
    Object.assign(env, { VAPID_PUBLIC_KEY: 'test-public', VAPID_PRIVATE_KEY: 'test-private' });
    vi.spyOn(webpush, 'setVapidDetails').mockImplementation(() => {});
    received = [];
    vi.spyOn(webpush, 'sendNotification').mockImplementation(async (sub, payload) => {
      received.push({ endpoint: sub.endpoint, message: JSON.parse(String(payload)) });
      return { statusCode: 201, body: '', headers: {} };
    });
    await subscribe(me, { endpoint: endpointOf(me), keys }, null);
    await subscribe(partner, { endpoint: endpointOf(partner), keys }, null);
  });

  afterEach(() => {
    Object.assign(env, vapid);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const task = (input: Record<string, unknown>) =>
    createEventSchema.parse({
      kind: 'task',
      title: '買い物',
      participantIds: [me, partner],
      ...input,
    });

  it('相手が今日のタスクを追加したら、自分にだけ届く', async () => {
    await createEvent(task({ allDay: true, startsAt: iso('2026-09-14T00:00:00') }), partner);
    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(received[0]).toEqual({
      endpoint: endpointOf(me),
      message: {
        title: 'Bがタスクを追加しました',
        body: '買い物 ・ 今日',
        url: '/calendar?date=2026-09-14',
        tag: expect.stringMatching(/^change:added:/),
      },
    });
  });

  it('今日でない物・自分の操作・参加していない物は届かない', async () => {
    await createEvent(task({ startsAt: iso('2026-09-15T10:00:00') }), partner);
    await createEvent(task({ startsAt: iso('2026-09-13T10:00:00') }), partner);
    await createEvent(task({ startsAt: iso('2026-09-14T10:00:00'), participantIds: [me] }), me);
    await createEvent(
      task({ startsAt: iso('2026-09-14T10:00:00'), participantIds: [partner] }),
      partner,
    );
    // 届く物を最後に足し、それが届くまで待ってから、ほかが届いていないことを確かめる
    await createEvent(
      createEventSchema.parse({
        kind: 'event',
        title: '歯医者',
        startsAt: iso('2026-09-14T15:00:00'),
        endsAt: iso('2026-09-14T16:00:00'),
        participantIds: [me, partner],
      }),
      me,
    );
    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(received[0]?.endpoint).toBe(endpointOf(partner));
    expect(received[0]?.message).toMatchObject({
      title: 'Aが予定を追加しました',
      body: '歯医者 ・ 今日 15:00',
    });
  });

  it('相手が今日の予定・タスクを削除したら届く（繰り返しの今日の回だけの削除も）', async () => {
    const single = await createEvent(task({ startsAt: iso('2026-09-14T10:00:00') }), me);
    const daily = await createEvent(
      task({ title: '薬', startsAt: iso('2026-09-10T08:00:00'), rrule: 'FREQ=DAILY' }),
      me,
    );
    await vi.waitFor(() => expect(received).toHaveLength(1));
    received = [];

    await deleteEvent(single.id, { scope: 'all' }, partner);
    await deleteEvent(
      daily.id,
      { scope: 'this', occurrenceStart: jst('2026-09-14T08:00:00') },
      partner,
    );
    await vi.waitFor(() => expect(received).toHaveLength(2));
    expect(received.map((r) => [r.endpoint, r.message.title, r.message.body]).sort()).toEqual([
      [endpointOf(me), 'Bがタスクを削除しました', '薬 ・ 今日 08:00'],
      [endpointOf(me), 'Bがタスクを削除しました', '買い物 ・ 今日 10:00'],
    ]);
  });
});
