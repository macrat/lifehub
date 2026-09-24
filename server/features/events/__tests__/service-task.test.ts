import { beforeEach, describe, expect, it } from 'vitest';
import { dateRangeQuerySchema } from '../../../../shared/validation/common.ts';
import { createEventSchema, updateEventSchema } from '../../../../shared/validation/events.ts';
import { ValidationError } from '../../../lib/errors.ts';
import {
  completeEvent,
  createEvent,
  deleteEvent,
  listItems,
  uncompleteEvent,
  updateEvent,
} from '../service.ts';
import { iso, jst, now, resetUsers, september, userId } from './service-fixtures.ts';

const weeklyTask = () =>
  createEventSchema.parse({
    kind: 'task',
    title: 'ゴミ出し',
    startsAt: iso('2026-09-07T09:00:00'),
    participantIds: [userId],
    rrule: 'FREQ=WEEKLY',
  });

describe('events service', () => {
  beforeEach(resetUsers);

  describe('タスク', () => {
    const task = (input: Record<string, unknown>) =>
      createEventSchema.parse({ kind: 'task', participantIds: [userId], ...input });

    it('開始日時が未来のタスクは開始日、過去・未設定は今日に置く', async () => {
      await createEvent(task({ title: '未来', startsAt: iso('2026-09-20T10:00:00') }), userId);
      await createEvent(task({ title: '過去', startsAt: iso('2026-09-01T10:00:00') }), userId);
      await createEvent(task({ title: '未設定', endsAt: iso('2026-09-25T10:00:00') }), userId);
      const list = await listItems(september, now);
      // 同日内は開始（無ければ期限）の時刻順
      expect(list.map((t) => [t.title, t.placementDate, t.occurrenceStart])).toEqual([
        ['過去', '2026-09-14', null],
        ['未設定', '2026-09-14', null],
        ['未来', '2026-09-20', null],
      ]);
    });

    it('完了すると完了日の位置に移り、取り消すと戻る', async () => {
      const created = await createEvent(task({ title: '買い物' }), userId);
      await completeEvent(created.id, {}, userId, jst('2026-09-10T18:00:00'));
      let list = await listItems(september, now);
      expect(list.map((t) => [t.placementDate, t.completedAt])).toEqual([
        ['2026-09-10', iso('2026-09-10T18:00:00')],
      ]);
      await uncompleteEvent(created.id, {}, userId);
      list = await listItems(september, now);
      expect(list.map((t) => [t.placementDate, t.completedAt])).toEqual([['2026-09-14', null]]);
    });

    it('期限超過を判定する', async () => {
      await createEvent(task({ title: '超過', endsAt: iso('2026-09-13T10:00:00') }), userId);
      await createEvent(task({ title: '余裕', endsAt: iso('2026-09-15T10:00:00') }), userId);
      const list = await listItems(september, now);
      expect(list.map((t) => [t.title, t.kind === 'task' && t.isOverdue])).toEqual([
        ['超過', true],
        ['余裕', false],
      ]);
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

    it('開始と期限の両方を持つ繰り返しは同じ間隔でずれる', async () => {
      await createEvent(
        task({
          title: '家賃',
          startsAt: iso('2026-09-20T00:00:00'),
          endsAt: iso('2026-09-27T00:00:00'),
          rrule: 'FREQ=MONTHLY',
        }),
        userId,
      );
      const list = await listItems(
        dateRangeQuerySchema.parse({ from: '2026-09-01', to: '2026-12-31' }),
        now,
      );
      expect(list.map((t) => [t.startsAt, t.endsAt])).toEqual([
        [iso('2026-09-20T00:00:00'), iso('2026-09-27T00:00:00')],
        [iso('2026-10-20T00:00:00'), iso('2026-10-27T00:00:00')],
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
      const next = await updateEvent(
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
          t.id === next.id ? 'new' : 'old',
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
});
