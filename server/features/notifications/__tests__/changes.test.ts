import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iso, jst } from '../../../../shared/__tests__/jst.ts';
import { createEventSchema } from '../../../../shared/validation/events.ts';
import { resetUsers } from '../../../lib/db/test-db.ts';
import { completeEvent, createEvent, deleteEvent } from '../../events/service.ts';
import { type SentPush, stubWebPush } from '../../push/__tests__/web-push-stub.ts';
import { subscribe } from '../../push/service.ts';

const keys = { p256dh: 'test', auth: 'test' };
const endpointOf = (userId: string) => `https://fcm.googleapis.com/fcm/send/${userId}`;

describe('予定・タスクの追加・削除の通知', () => {
  let me: string;
  let partner: string;
  /** 端末（endpoint）ごとに届いた通知 */
  let received: SentPush[];

  beforeEach(async () => {
    ({ userId: me, partnerId: partner } = await resetUsers());
    // 「今日」を 2026-09-14 の正午に固定する（DB の待ち合わせのタイマーは本物のまま）
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(jst('2026-09-14T12:00:00'));
    received = stubWebPush();
    await subscribe(me, { endpoint: endpointOf(me), keys }, null);
    await subscribe(partner, { endpoint: endpointOf(partner), keys }, null);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** 2 人が参加する予定・タスクの入力（残りの項目は input で渡す） */
  const itemOf = (kind: 'event' | 'task', title: string) => (input: Record<string, unknown>) =>
    createEventSchema.parse({ kind, title, participantIds: [me, partner], ...input });
  const task = itemOf('task', '買い物');
  const event = itemOf('event', '歯医者');

  /** 届いた通知の [宛先の端末, 見出し, 本文]（順不同なので並べ替える） */
  const summary = () => received.map((r) => [r.endpoint, r.message.title, r.message.body]).sort();

  it('相手が今日のタスクを追加したら、自分にだけ届く', async () => {
    await createEvent(task({ allDay: true, startsAt: iso('2026-09-14T00:00:00') }), partner);
    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(received[0]).toEqual({
      endpoint: endpointOf(me),
      message: {
        title: 'Bがタスクを追加しました',
        body: '開始 9/14 終日',
        url: '/calendar?date=2026-09-14',
        tag: expect.stringMatching(/^change:added:/),
      },
    });
  });

  it('今日に手を付ける回があれば届く: 昨日から繰り越したタスク・繰り返し・今日の終日の予定・これからの予定', async () => {
    await createEvent(
      task({ title: '昨日の買い物', startsAt: iso('2026-09-13T10:00:00') }),
      partner,
    );
    await createEvent(
      task({ title: '薬', startsAt: iso('2026-09-10T08:00:00'), rrule: 'FREQ=DAILY' }),
      partner,
    );
    await createEvent(
      event({
        title: '運動会',
        allDay: true,
        startsAt: iso('2026-09-14T00:00:00'),
        endsAt: iso('2026-09-14T00:00:00'),
      }),
      partner,
    );
    await createEvent(
      event({
        title: '散歩',
        startsAt: iso('2026-09-01T18:00:00'),
        endsAt: iso('2026-09-01T19:00:00'),
        rrule: 'FREQ=DAILY',
      }),
      partner,
    );
    await vi.waitFor(() => expect(received).toHaveLength(4));
    expect(summary()).toEqual(
      [
        [endpointOf(me), 'Bがタスクを追加しました', '開始 9/13 10:00'],
        // 未完了の回が 2 つ（昨日から繰り越した回と今日の回）並んでも、通知は 1 つ
        [endpointOf(me), 'Bがタスクを追加しました', '開始 9/13 08:00'],
        [endpointOf(me), 'Bが予定を追加しました', '開始 9/14 終日'],
        [endpointOf(me), 'Bが予定を追加しました', '開始 9/14 18:00'],
      ].sort(),
    );
  });

  it('始まった予定・今日でない物・自分の操作・参加していない物は届かない', async () => {
    await createEvent(
      event({ startsAt: iso('2026-09-14T10:00:00'), endsAt: iso('2026-09-14T13:00:00') }),
      partner,
    );
    await createEvent(
      event({
        title: '旅行',
        allDay: true,
        startsAt: iso('2026-09-13T00:00:00'),
        endsAt: iso('2026-09-15T00:00:00'),
      }),
      partner,
    );
    await createEvent(task({ startsAt: iso('2026-09-15T10:00:00') }), partner);
    await createEvent(task({ startsAt: iso('2026-09-14T10:00:00'), participantIds: [me] }), me);
    await createEvent(
      task({ startsAt: iso('2026-09-14T10:00:00'), participantIds: [partner] }),
      partner,
    );
    // 届く物を最後に足し、それが届くまで待ってから、ほかが届いていないことを確かめる
    await createEvent(
      event({ startsAt: iso('2026-09-14T15:00:00'), endsAt: iso('2026-09-14T16:00:00') }),
      me,
    );
    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(summary()).toEqual([[endpointOf(partner), 'Aが予定を追加しました', '開始 9/14 15:00']]);
  });

  it('相手が今日に手を付ける回を削除したら届き、完了したタスクの削除は届かない', async () => {
    const single = await createEvent(task({ startsAt: iso('2026-09-13T10:00:00') }), me);
    const done = await createEvent(
      task({ title: '済み', startsAt: iso('2026-09-14T09:00:00') }),
      me,
    );
    await completeEvent(done.id, {}, me);
    const daily = await createEvent(
      task({ title: '薬', startsAt: iso('2026-09-14T08:00:00'), rrule: 'FREQ=DAILY' }),
      me,
    );
    const walk = await createEvent(
      event({
        title: '散歩',
        startsAt: iso('2026-09-01T18:00:00'),
        endsAt: iso('2026-09-01T19:00:00'),
        rrule: 'FREQ=DAILY',
      }),
      me,
    );
    await vi.waitFor(() => expect(received).toHaveLength(4));
    received.length = 0;

    await deleteEvent(done.id, { scope: 'all' }, partner);
    await deleteEvent(single.id, { scope: 'all' }, partner);
    await deleteEvent(
      daily.id,
      { scope: 'this', occurrenceStart: jst('2026-09-14T08:00:00') },
      partner,
    );
    await deleteEvent(
      walk.id,
      { scope: 'following', occurrenceStart: jst('2026-09-14T18:00:00') },
      partner,
    );
    await vi.waitFor(() => expect(received).toHaveLength(3));
    expect(summary()).toEqual(
      [
        [endpointOf(me), 'Bがタスクを削除しました', '開始 9/13 10:00'],
        [endpointOf(me), 'Bがタスクを削除しました', '開始 9/14 08:00'],
        [endpointOf(me), 'Bが予定を削除しました', '開始 9/14 18:00'],
      ].sort(),
    );
  });

  it('繰り返しの今日でない回だけの削除は届かない', async () => {
    const daily = await createEvent(
      task({ title: '薬', startsAt: iso('2026-09-14T08:00:00'), rrule: 'FREQ=DAILY' }),
      me,
    );
    await vi.waitFor(() => expect(received).toHaveLength(1));
    received.length = 0;
    await deleteEvent(
      daily.id,
      { scope: 'this', occurrenceStart: jst('2026-09-15T08:00:00') },
      partner,
    );
    await deleteEvent(daily.id, { scope: 'all' }, partner);
    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(summary()).toEqual([[endpointOf(me), 'Bがタスクを削除しました', '開始 9/14 08:00']]);
  });
});
