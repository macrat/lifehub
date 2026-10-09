import { beforeEach, describe, expect, it } from 'vitest';
import { iso, jst } from '../../../../shared/__tests__/jst.ts';
import { dateRangeQuerySchema } from '../../../../shared/validation/common.ts';
import { createEventSchema, updateEventSchema } from '../../../../shared/validation/events.ts';
import { resetUsers } from '../../../lib/db/test-db.ts';
import { ValidationError } from '../../../lib/errors.ts';
import {
  completeEvent,
  createEvent,
  deleteEvent,
  listItems,
  uncompleteEvent,
  updateEvent,
} from '../service.ts';
import { now, september, taskInput } from './service-fixtures.ts';

let userId: string;

const task = (input: Record<string, unknown>) => taskInput(userId, input);

const weeklyTask = () =>
  createEventSchema.parse({
    kind: 'task',
    title: 'ゴミ出し',
    startsAt: iso('2026-09-07T09:00:00'),
    participantIds: [userId],
    rrule: 'FREQ=WEEKLY',
  });

describe('events service', () => {
  beforeEach(async () => {
    ({ userId } = await resetUsers());
  });

  describe('タスク', () => {
    it('開始が未来のタスクは開始日、過去・今日は今日に置く', async () => {
      await createEvent(task({ title: '未来', startsAt: iso('2026-09-20T10:00:00') }), userId);
      await createEvent(task({ title: '過去', startsAt: iso('2026-09-01T10:00:00') }), userId);
      await createEvent(
        task({ title: '今日の終日', allDay: true, startsAt: iso('2026-09-14T00:00:00') }),
        userId,
      );
      const list = await listItems(september, now);
      // 同日内は終日 → 時刻のある開始の順
      expect(list.map((t) => [t.title, t.placementDate, t.occurrenceStart])).toEqual([
        ['今日の終日', '2026-09-14', null],
        ['過去', '2026-09-14', null],
        ['未来', '2026-09-20', null],
      ]);
    });

    it('完了すると完了日の位置に移り、取り消すと戻る', async () => {
      const created = await createEvent(
        task({ title: '買い物', startsAt: iso('2026-09-01T10:00:00') }),
        userId,
      );
      await completeEvent(created.id, {}, userId, jst('2026-09-10T18:00:00'));
      let list = await listItems(september, now);
      expect(list.map((t) => [t.placementDate, t.completedAt])).toEqual([
        ['2026-09-10', iso('2026-09-10T18:00:00')],
      ]);
      await uncompleteEvent(created.id, {}, userId);
      list = await listItems(september, now);
      expect(list.map((t) => [t.placementDate, t.completedAt])).toEqual([['2026-09-14', null]]);
    });

    it('繰り返しタスクは未完了を最大 2 つまで表示し、過去の回は今日に置く', async () => {
      // 毎週月曜 9:00。今日は 9/14（月）正午
      await createEvent(weeklyTask(), userId);
      const list = await listItems(september, now);
      expect(list.map((t) => [t.occurrenceStart, t.placementDate])).toEqual([
        [iso('2026-09-07T09:00:00'), '2026-09-14'],
        [iso('2026-09-14T09:00:00'), '2026-09-14'],
      ]);
    });

    it('未完了の回は 2 つ後の回が来た時点で放棄される', async () => {
      await createEvent(weeklyTask(), userId);
      const list = await listItems(september, jst('2026-09-21T12:00:00'));
      expect(list.map((t) => [t.occurrenceStart, t.placementDate])).toEqual([
        [iso('2026-09-14T09:00:00'), '2026-09-21'],
        [iso('2026-09-21T09:00:00'), '2026-09-21'],
      ]);
    });

    it('放棄は暦日で決まるので、その日の回の時刻より前でも今日の回が出る', async () => {
      // 9/21 の回は 9:00。同じ 9/21 なら 0:00 でも 12:00 でも 9/14 と 9/21 が並ぶ
      await createEvent(weeklyTask(), userId);
      const list = await listItems(september, jst('2026-09-21T00:00:00'));
      expect(list.map((t) => [t.occurrenceStart, t.placementDate])).toEqual([
        [iso('2026-09-14T09:00:00'), '2026-09-21'],
        [iso('2026-09-21T09:00:00'), '2026-09-21'],
      ]);
    });

    it('毎日の回をためても、出るのは前日と今日の 2 つ', async () => {
      await createEvent(
        createEventSchema.parse({
          kind: 'task',
          title: '薬',
          startsAt: iso('2026-09-15T17:00:00'),
          participantIds: [userId],
          rrule: 'FREQ=DAILY',
        }),
        userId,
      );
      const list = await listItems(september, jst('2026-09-18T10:00:00'));
      expect(list.map((t) => [t.occurrenceStart, t.placementDate])).toEqual([
        [iso('2026-09-17T17:00:00'), '2026-09-18'],
        [iso('2026-09-18T17:00:00'), '2026-09-18'],
      ]);
    });

    it('何年も前から続く繰り返しでも、表示は今の前後の回だけで決まる', async () => {
      // dtstart が遠い過去でも、放棄されずに残るのは「今以前の最後の回の 1 つ前」以降だけ
      await createEvent(
        createEventSchema.parse({
          kind: 'task',
          title: 'ゴミ出し',
          startsAt: iso('2021-09-06T09:00:00'),
          participantIds: [userId],
          rrule: 'FREQ=WEEKLY',
        }),
        userId,
      );
      const list = await listItems(september, now);
      expect(list.map((t) => [t.occurrenceStart, t.placementDate])).toEqual([
        [iso('2026-09-07T09:00:00'), '2026-09-14'],
        [iso('2026-09-14T09:00:00'), '2026-09-14'],
      ]);
    });

    it('遠い過去に完了した回も、その完了日に出る', async () => {
      const created = await createEvent(
        createEventSchema.parse({
          kind: 'task',
          title: 'ゴミ出し',
          startsAt: iso('2026-01-05T09:00:00'),
          participantIds: [userId],
          rrule: 'FREQ=WEEKLY',
        }),
        userId,
      );
      await completeEvent(
        created.id,
        { occurrenceStart: jst('2026-01-12T09:00:00') },
        userId,
        jst('2026-01-12T20:00:00'),
      );
      const january = dateRangeQuerySchema.parse({ from: '2026-01-01', to: '2026-01-31' });
      const list = await listItems(january, now);
      expect(list.map((t) => [t.occurrenceStart, t.placementDate, t.completedAt !== null])).toEqual(
        [[iso('2026-01-12T09:00:00'), '2026-01-12', true]],
      );
    });

    it('完了した回は完了日に置き、次の未完了が繰り上がる。完了だけの回は変更ありにならない', async () => {
      const created = await createEvent(weeklyTask(), userId);
      await completeEvent(
        created.id,
        { occurrenceStart: jst('2026-09-07T09:00:00') },
        userId,
        jst('2026-09-07T10:00:00'),
      );
      const list = await listItems(september, now);
      expect(
        list.map((t) => [t.occurrenceStart, t.placementDate, t.completedAt !== null, t.isModified]),
      ).toEqual([
        [iso('2026-09-07T09:00:00'), '2026-09-07', true, false],
        [iso('2026-09-14T09:00:00'), '2026-09-14', false, false],
        [iso('2026-09-21T09:00:00'), '2026-09-21', false, false],
      ]);
    });

    it('存在しない回は完了にできず、繰り返しでは回の指定が要る', async () => {
      const created = await createEvent(weeklyTask(), userId);
      await expect(
        completeEvent(created.id, { occurrenceStart: jst('2026-09-08T09:00:00') }, userId),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(completeEvent(created.id, {}, userId)).rejects.toBeInstanceOf(ValidationError);
    });

    it('「この回だけ」の取り消しと「これ以降すべて」の分割', async () => {
      const created = await createEvent(weeklyTask(), userId);
      await deleteEvent(
        created.id,
        { scope: 'this', occurrenceStart: jst('2026-09-07T09:00:00') },
        userId,
      );
      await updateEvent(
        created.id,
        updateEventSchema.parse({
          ...weeklyTask(),
          title: '資源ゴミ',
          startsAt: iso('2026-09-21T09:00:00'),
          scope: 'following',
          occurrenceStart: iso('2026-09-21T09:00:00'),
        }),
        userId,
      );
      // 元の系列は 9/14 で終わる。最後の回は次の回が無いので放棄されず、完了するまで今日に残る
      const list = await listItems(september, jst('2026-09-28T12:00:00'));
      expect(
        list.map((t) => [
          t.id === created.id ? 'old' : 'new',
          t.title,
          t.occurrenceStart,
          t.placementDate,
        ]),
      ).toEqual([
        ['old', 'ゴミ出し', iso('2026-09-14T09:00:00'), '2026-09-28'],
        ['new', '資源ゴミ', iso('2026-09-21T09:00:00'), '2026-09-28'],
        ['new', '資源ゴミ', iso('2026-09-28T09:00:00'), '2026-09-28'],
      ]);
    });

    it('「これ以降すべて」の分割でも、以降の完了した回は履歴として新しい繰り返しに残る', async () => {
      const created = await createEvent(weeklyTask(), userId);
      // 先の回（9/28）を早めに完了しておく
      await completeEvent(
        created.id,
        { occurrenceStart: jst('2026-09-28T09:00:00') },
        userId,
        jst('2026-09-10T10:00:00'),
      );
      await updateEvent(
        created.id,
        updateEventSchema.parse({
          ...weeklyTask(),
          title: '資源ゴミ',
          startsAt: iso('2026-09-21T09:00:00'),
          scope: 'following',
          occurrenceStart: iso('2026-09-21T09:00:00'),
        }),
        userId,
      );
      const completed = (await listItems(september, jst('2026-09-12T12:00:00'))).filter(
        (t) => t.completedAt !== null,
      );
      expect(completed.map((t) => [t.id === created.id, t.occurrenceStart, t.completedAt])).toEqual(
        [[false, iso('2026-09-28T09:00:00'), iso('2026-09-10T10:00:00')]],
      );
    });

    it('「すべて」の変更で基準日時が変わっても、完了した回は履歴として残る', async () => {
      const created = await createEvent(weeklyTask(), userId);
      await completeEvent(
        created.id,
        { occurrenceStart: jst('2026-09-07T09:00:00') },
        userId,
        jst('2026-09-07T10:00:00'),
      );
      await updateEvent(
        created.id,
        updateEventSchema.parse({
          ...weeklyTask(),
          startsAt: iso('2026-09-08T09:00:00'),
          scope: 'all',
        }),
        userId,
      );
      const list = await listItems(september, now);
      expect(list.map((t) => [t.placementDate, t.completedAt !== null])).toEqual([
        ['2026-09-07', true],
        ['2026-09-14', false],
        ['2026-09-15', false],
      ]);
    });
  });

  describe('種別の変更', () => {
    it('単発の予定をタスクに変えられる', async () => {
      const created = await createEvent(
        createEventSchema.parse({
          kind: 'event',
          title: '買い物',
          startsAt: iso('2026-09-20T10:00:00'),
          endsAt: iso('2026-09-20T11:00:00'),
          participantIds: [userId],
        }),
        userId,
      );
      await updateEvent(
        created.id,
        updateEventSchema.parse({
          kind: 'task',
          title: '買い物',
          startsAt: iso('2026-09-20T10:00:00'),
          participantIds: [userId],
          scope: 'all',
        }),
        userId,
      );
      const list = await listItems(september, now);
      expect(list.map((t) => [t.kind, t.startsAt, t.endsAt, t.placementDate])).toEqual([
        ['task', iso('2026-09-20T10:00:00'), null, '2026-09-20'],
      ]);
    });

    it('完了したタスクを予定に変えると完了が外れる', async () => {
      const created = await createEvent(
        task({ title: '買い物', startsAt: iso('2026-09-01T10:00:00') }),
        userId,
      );
      await completeEvent(created.id, {}, userId, jst('2026-09-10T18:00:00'));
      await updateEvent(
        created.id,
        updateEventSchema.parse({
          kind: 'event',
          title: '買い物',
          startsAt: iso('2026-09-20T10:00:00'),
          endsAt: iso('2026-09-20T11:00:00'),
          participantIds: [userId],
          scope: 'all',
        }),
        userId,
      );
      const list = await listItems(september, now);
      expect(list.map((t) => [t.kind, t.completedAt])).toEqual([['event', null]]);
    });

    it('繰り返しのタスクを予定に変えると、完了した回も含めて回を捨てる', async () => {
      const created = await createEvent(weeklyTask(), userId);
      await completeEvent(
        created.id,
        { occurrenceStart: jst('2026-09-07T09:00:00') },
        userId,
        jst('2026-09-07T10:00:00'),
      );
      await updateEvent(
        created.id,
        updateEventSchema.parse({
          ...weeklyTask(),
          kind: 'event',
          startsAt: iso('2026-09-07T09:00:00'),
          endsAt: iso('2026-09-07T10:00:00'),
          scope: 'all',
        }),
        userId,
      );
      const list = await listItems(september, now);
      expect(list.map((t) => [t.kind, t.occurrenceStart, t.completedAt])).toEqual([
        ['event', iso('2026-09-07T09:00:00'), null],
        ['event', iso('2026-09-14T09:00:00'), null],
        ['event', iso('2026-09-21T09:00:00'), null],
        ['event', iso('2026-09-28T09:00:00'), null],
      ]);
    });

    it('繰り返しの 1 回だけの種別は変えられない', async () => {
      const created = await createEvent(weeklyTask(), userId);
      await expect(
        updateEvent(
          created.id,
          updateEventSchema.parse({
            ...weeklyTask(),
            kind: 'event',
            endsAt: iso('2026-09-14T10:00:00'),
            startsAt: iso('2026-09-14T09:00:00'),
            scope: 'this',
            occurrenceStart: iso('2026-09-14T09:00:00'),
          }),
          userId,
        ),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });
});
