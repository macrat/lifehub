import { beforeEach, describe, expect, it } from 'vitest';
import { createEventSchema, updateEventSchema } from '../../../../shared/validation/events.ts';
import { ValidationError } from '../../../lib/errors.ts';
import { truncateAll } from '../../../lib/test-db.ts';
import { createUser } from '../../users/service.ts';
import { createEvent, deleteEvent, getEvent, listOccurrences, updateEvent } from '../service.ts';

const jst = (s: string) => new Date(`${s}+09:00`);
const iso = (s: string) => jst(s).toISOString();

let userId: string;

const weekly = createEventSchema.parse({
  title: '週次ミーティング',
  startsAt: iso('2026-09-07T09:00:00'),
  endsAt: iso('2026-09-07T10:00:00'),
  rrule: 'FREQ=WEEKLY',
});

const september = { from: jst('2026-09-01T00:00:00'), to: jst('2026-10-01T00:00:00') };

describe('events service', () => {
  beforeEach(async () => {
    await truncateAll();
    userId = (await createUser({ email: 'a@example.com', name: 'A', password: 'password-123456' }))
      .id;
  });

  it('単発の予定を作成・取得できる', async () => {
    const created = await createEvent(
      createEventSchema.parse({
        title: '歯医者',
        startsAt: iso('2026-09-10T14:00:00'),
        endsAt: iso('2026-09-10T15:00:00'),
        location: '駅前',
      }),
      userId,
    );
    expect(await getEvent(created.id)).toMatchObject({
      title: '歯医者',
      location: '駅前',
      rrule: null,
    });
    const list = await listOccurrences(september);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: created.id,
      isRecurring: false,
      occurrenceStart: created.startsAt,
    });
  });

  it('終日の予定は JST の日境界に正規化され、終了日は含む', async () => {
    const created = await createEvent(
      createEventSchema.parse({
        title: '旅行',
        allDay: true,
        startsAt: iso('2026-09-20T12:34:00'),
        endsAt: iso('2026-09-21T00:00:00'),
      }),
      userId,
    );
    expect(created.startsAt).toBe(iso('2026-09-20T00:00:00'));
    expect(created.endsAt).toBe(iso('2026-09-22T00:00:00'));
  });

  it('不正な繰り返しルールは検証エラー', async () => {
    await expect(createEvent({ ...weekly, rrule: 'FREQ=MINUTELY' }, userId)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('繰り返し予定を期間内に展開する', async () => {
    await createEvent(weekly, userId);
    const list = await listOccurrences(september);
    expect(list.map((o) => o.startsAt)).toEqual([
      iso('2026-09-07T09:00:00'),
      iso('2026-09-14T09:00:00'),
      iso('2026-09-21T09:00:00'),
      iso('2026-09-28T09:00:00'),
    ]);
    expect(list[0]?.isRecurring).toBe(true);
  });

  it('期間をまたぐ発生も含める', async () => {
    await createEvent(
      createEventSchema.parse({
        title: '夜勤',
        startsAt: iso('2026-08-31T22:00:00'),
        endsAt: iso('2026-09-01T06:00:00'),
      }),
      userId,
    );
    expect(await listOccurrences(september)).toHaveLength(1);
  });

  it('「この回だけ」の変更と削除', async () => {
    const created = await createEvent(weekly, userId);
    await updateEvent(
      created.id,
      updateEventSchema.parse({
        ...weekly,
        title: '週次ミーティング（延期）',
        startsAt: iso('2026-09-15T09:00:00'),
        endsAt: iso('2026-09-15T10:00:00'),
        scope: 'this',
        occurrenceStart: iso('2026-09-14T09:00:00'),
      }),
      userId,
    );
    await deleteEvent(
      created.id,
      { scope: 'this', occurrenceStart: jst('2026-09-21T09:00:00') },
      userId,
    );

    const list = await listOccurrences(september);
    expect(list.map((o) => [o.startsAt, o.title, o.isModified])).toEqual([
      [iso('2026-09-07T09:00:00'), '週次ミーティング', false],
      [iso('2026-09-15T09:00:00'), '週次ミーティング（延期）', true],
      [iso('2026-09-28T09:00:00'), '週次ミーティング', false],
    ]);
    expect(list[1]?.occurrenceStart).toBe(iso('2026-09-14T09:00:00'));
  });

  it('「これ以降すべて」の変更は元を打ち切って新しいマスターを作る', async () => {
    const created = await createEvent(weekly, userId);
    const next = await updateEvent(
      created.id,
      updateEventSchema.parse({
        ...weekly,
        title: '週次ミーティング（新時間）',
        startsAt: iso('2026-09-21T10:00:00'),
        endsAt: iso('2026-09-21T11:00:00'),
        scope: 'following',
        occurrenceStart: iso('2026-09-21T09:00:00'),
      }),
      userId,
    );
    expect(next.id).not.toBe(created.id);
    expect((await getEvent(created.id)).rrule).toBe('FREQ=WEEKLY;UNTIL=20260921T085959Z');

    const list = await listOccurrences(september);
    expect(list.map((o) => [o.id, o.startsAt])).toEqual([
      [created.id, iso('2026-09-07T09:00:00')],
      [created.id, iso('2026-09-14T09:00:00')],
      [next.id, iso('2026-09-21T10:00:00')],
      [next.id, iso('2026-09-28T10:00:00')],
    ]);
  });

  it('「これ以降すべて」の削除', async () => {
    const created = await createEvent(weekly, userId);
    await deleteEvent(
      created.id,
      { scope: 'following', occurrenceStart: jst('2026-09-21T09:00:00') },
      userId,
    );
    expect(await listOccurrences(september)).toHaveLength(2);
  });

  it('先頭の発生に対する「これ以降すべて」の削除はマスターごと消す', async () => {
    const created = await createEvent(weekly, userId);
    await deleteEvent(
      created.id,
      { scope: 'following', occurrenceStart: jst('2026-09-07T09:00:00') },
      userId,
    );
    expect(await listOccurrences(september)).toHaveLength(0);
  });

  it('「すべて」の変更で開始日時が変わると例外は捨てられる', async () => {
    const created = await createEvent(weekly, userId);
    await deleteEvent(
      created.id,
      { scope: 'this', occurrenceStart: jst('2026-09-14T09:00:00') },
      userId,
    );
    await updateEvent(
      created.id,
      updateEventSchema.parse({
        ...weekly,
        startsAt: iso('2026-09-08T09:00:00'),
        endsAt: iso('2026-09-08T10:00:00'),
        scope: 'all',
      }),
      userId,
    );
    expect(await listOccurrences(september)).toHaveLength(4);
  });
});
