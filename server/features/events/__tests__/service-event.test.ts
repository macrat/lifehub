import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { iso, jst } from '../../../../shared/__tests__/jst.ts';
import { newId } from '../../../../shared/id.ts';
import { dateRangeQuerySchema } from '../../../../shared/validation/common.ts';
import { createEventSchema, updateEventSchema } from '../../../../shared/validation/events.ts';
import { db } from '../../../lib/db/client.ts';
import { resetUsers } from '../../../lib/db/test-db.ts';
import { NotFoundError, ValidationError } from '../../../lib/errors.ts';
import { events } from '../schema.ts';
import {
  completeEvent,
  createEvent,
  deleteEvent,
  getEvent,
  listItems,
  updateEvent,
} from '../service.ts';
import { now, september } from './service-fixtures.ts';

let userId: string;
let partnerId: string;

const weekly = () =>
  createEventSchema.parse({
    kind: 'event',
    title: '週次ミーティング',
    startsAt: iso('2026-09-07T09:00:00'),
    endsAt: iso('2026-09-07T10:00:00'),
    participantIds: [userId],
    rrule: 'FREQ=WEEKLY',
  });

describe('events service', () => {
  beforeEach(async () => {
    ({ userId, partnerId } = await resetUsers());
  });

  describe('予定', () => {
    it('単発の予定を作成・取得できる', async () => {
      const created = await createEvent(
        createEventSchema.parse({
          kind: 'event',
          title: '歯医者',
          startsAt: iso('2026-09-10T14:00:00'),
          endsAt: iso('2026-09-10T15:00:00'),
          participantIds: [userId, partnerId],
          location: '駅前',
        }),
        userId,
      );
      expect(await getEvent(created.id)).toMatchObject({
        title: '歯医者',
        location: '駅前',
        rrule: null,
        participantIds: [userId, partnerId],
      });
      const list = await listItems(september, now);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        id: created.id,
        kind: 'event',
        isRecurring: false,
        occurrenceStart: null,
        placementDate: '2026-09-10',
      });
    });

    it('同じ id で送り直しても二重に作られない（オフラインで溜めた書き込みの再送）', async () => {
      const id = newId();
      const input = createEventSchema.parse({
        kind: 'event',
        title: '歯医者',
        startsAt: iso('2026-09-10T14:00:00'),
        endsAt: iso('2026-09-10T15:00:00'),
        participantIds: [userId],
      });
      await createEvent(input, userId, id);
      await createEvent(input, userId, id);

      const list = await listItems(september, now);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ id, title: '歯医者', participantIds: [userId] });
    });

    it('編集した後に古い作成が送り直されても、行も参加者も巻き戻らない', async () => {
      const id = newId();
      const input = createEventSchema.parse({
        kind: 'event',
        title: '歯医者',
        startsAt: iso('2026-09-10T14:00:00'),
        endsAt: iso('2026-09-10T15:00:00'),
        participantIds: [userId],
      });
      await createEvent(input, userId, id);
      await updateEvent(
        id,
        updateEventSchema.parse({
          ...input,
          startsAt: iso('2026-09-10T14:00:00'),
          endsAt: iso('2026-09-10T15:00:00'),
          title: '矯正歯科',
          participantIds: [partnerId],
          scope: 'all',
        }),
        userId,
      );
      await createEvent(input, userId, id);

      expect(await getEvent(id)).toMatchObject({ title: '矯正歯科', participantIds: [partnerId] });
    });

    it('終日の予定は JST の日境界に正規化され、終了日は含む', async () => {
      const created = await createEvent(
        createEventSchema.parse({
          kind: 'event',
          title: '旅行',
          allDay: true,
          startsAt: iso('2026-09-20T12:34:00'),
          endsAt: iso('2026-09-21T00:00:00'),
          participantIds: [userId],
        }),
        userId,
      );
      expect(created.startsAt).toBe(iso('2026-09-20T00:00:00'));
      expect(created.endsAt).toBe(iso('2026-09-22T00:00:00'));
    });

    it('不正な繰り返しルールは検証エラー', async () => {
      await expect(
        createEvent({ ...weekly(), rrule: 'FREQ=MINUTELY' }, userId),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('繰り返し予定を期間内に展開する', async () => {
      await createEvent(weekly(), userId);
      const list = await listItems(september, now);
      expect(list.map((o) => o.startsAt)).toEqual([
        iso('2026-09-07T09:00:00'),
        iso('2026-09-14T09:00:00'),
        iso('2026-09-21T09:00:00'),
        iso('2026-09-28T09:00:00'),
      ]);
      expect(list[0]?.isRecurring).toBe(true);
    });

    it('複数日の予定は日ごとに 1 件、同日内は終日が先、深夜をまたぐ予定は 2 日に置かれる', async () => {
      await createEvent(
        createEventSchema.parse({
          kind: 'event',
          title: '旅行',
          allDay: true,
          startsAt: iso('2026-09-20T00:00:00'),
          endsAt: iso('2026-09-22T00:00:00'),
          participantIds: [userId],
        }),
        userId,
      );
      await createEvent(
        createEventSchema.parse({
          kind: 'event',
          title: '朝食',
          startsAt: iso('2026-09-20T08:00:00'),
          endsAt: iso('2026-09-20T09:00:00'),
          participantIds: [userId],
        }),
        userId,
      );
      await createEvent(
        createEventSchema.parse({
          kind: 'event',
          title: '夜勤',
          startsAt: iso('2026-09-19T22:00:00'),
          endsAt: iso('2026-09-20T06:00:00'),
          participantIds: [userId],
        }),
        userId,
      );
      const items = await listItems(
        dateRangeQuerySchema.parse({ from: '2026-09-20', to: '2026-09-21' }),
        now,
      );
      expect(
        items.map((i) => [
          i.placementDate,
          i.title,
          ...(i.kind === 'event' ? [i.dayIndex, i.dayCount] : []),
        ]),
      ).toEqual([
        ['2026-09-20', '旅行', 1, 3],
        ['2026-09-20', '夜勤', 2, 2],
        ['2026-09-20', '朝食', 1, 1],
        ['2026-09-21', '旅行', 2, 3],
      ]);
    });

    it('「この回だけ」の変更は全項目を持つ回の行になり、取り消した回は消える', async () => {
      const created = await createEvent(weekly(), userId);
      await updateEvent(
        created.id,
        updateEventSchema.parse({
          ...weekly(),
          title: '週次ミーティング（延期）',
          startsAt: iso('2026-09-15T09:00:00'),
          endsAt: iso('2026-09-15T10:00:00'),
          location: '会議室 B',
          participantIds: [userId, partnerId],
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

      const list = await listItems(september, now);
      expect(
        list.map((o) => [o.startsAt, o.title, o.location, o.participantIds, o.isModified]),
      ).toEqual([
        [iso('2026-09-07T09:00:00'), '週次ミーティング', null, [userId], false],
        [
          iso('2026-09-15T09:00:00'),
          '週次ミーティング（延期）',
          '会議室 B',
          [userId, partnerId],
          true,
        ],
        [iso('2026-09-28T09:00:00'), '週次ミーティング', null, [userId], false],
      ]);
      expect(list[1]).toMatchObject({
        id: created.id,
        occurrenceStart: iso('2026-09-14T09:00:00'),
      });
    });

    it('実体化された回の行の ID では読み書きできない（操作の対象は常に繰り返し元）', async () => {
      const created = await createEvent(weekly(), userId);
      await deleteEvent(
        created.id,
        { scope: 'this', occurrenceStart: jst('2026-09-14T09:00:00') },
        userId,
      );
      const [row] = await db
        .select({ id: events.id })
        .from(events)
        .where(eq(events.seriesId, created.id));
      if (!row) throw new Error('回の行が作られていない');

      await expect(getEvent(row.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(deleteEvent(row.id, { scope: 'all' }, userId)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      // 取り消した回は取り消されたまま残る
      expect((await listItems(september, now)).map((o) => o.startsAt)).not.toContain(
        iso('2026-09-14T09:00:00'),
      );
    });

    it('存在しない回は指定できない', async () => {
      const created = await createEvent(weekly(), userId);
      await expect(
        deleteEvent(
          created.id,
          { scope: 'this', occurrenceStart: jst('2026-09-08T09:00:00') },
          userId,
        ),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('「これ以降すべて」の変更は元を打ち切って新しい繰り返しを作る', async () => {
      const created = await createEvent(weekly(), userId);
      await updateEvent(
        created.id,
        updateEventSchema.parse({
          ...weekly(),
          title: '週次ミーティング（新時間）',
          startsAt: iso('2026-09-21T10:00:00'),
          endsAt: iso('2026-09-21T11:00:00'),
          scope: 'following',
          occurrenceStart: iso('2026-09-21T09:00:00'),
        }),
        userId,
      );
      expect((await getEvent(created.id)).rrule).toBe('FREQ=WEEKLY;UNTIL=20260921T085959Z');

      // 9/21 からは別の id の新しい繰り返しになる
      const list = await listItems(september, now);
      expect(list.map((o) => [o.id === created.id ? 'old' : 'new', o.startsAt])).toEqual([
        ['old', iso('2026-09-07T09:00:00')],
        ['old', iso('2026-09-14T09:00:00')],
        ['new', iso('2026-09-21T10:00:00')],
        ['new', iso('2026-09-28T10:00:00')],
      ]);
      expect(new Set(list.map((o) => o.id)).size).toBe(2);
    });

    it('「これ以降すべて」の削除。先頭の回に対しては繰り返しごと消す', async () => {
      const created = await createEvent(weekly(), userId);
      await deleteEvent(
        created.id,
        { scope: 'following', occurrenceStart: jst('2026-09-21T09:00:00') },
        userId,
      );
      expect(await listItems(september, now)).toHaveLength(2);
      await deleteEvent(
        created.id,
        { scope: 'following', occurrenceStart: jst('2026-09-07T09:00:00') },
        userId,
      );
      expect(await listItems(september, now)).toHaveLength(0);
    });

    it('「すべて」の変更で開始日時が変わると回の行は捨てられる', async () => {
      const created = await createEvent(weekly(), userId);
      await deleteEvent(
        created.id,
        { scope: 'this', occurrenceStart: jst('2026-09-14T09:00:00') },
        userId,
      );
      await updateEvent(
        created.id,
        updateEventSchema.parse({
          ...weekly(),
          startsAt: iso('2026-09-08T09:00:00'),
          endsAt: iso('2026-09-08T10:00:00'),
          scope: 'all',
        }),
        userId,
      );
      expect(await listItems(september, now)).toHaveLength(4);
    });

    it('予定は完了にできない', async () => {
      const created = await createEvent(weekly(), userId);
      await expect(completeEvent(created.id, {}, userId)).rejects.toBeInstanceOf(ValidationError);
    });
  });
});
