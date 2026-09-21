import { beforeEach, describe, expect, it } from 'vitest';
import { dateRangeQuerySchema } from '../../../../shared/validation/common.ts';
import { createEventSchema, updateEventSchema } from '../../../../shared/validation/events.ts';
import { ValidationError } from '../../../lib/errors.ts';
import { truncateAll } from '../../../lib/test-db.ts';
import { createUser } from '../../users/service.ts';
import {
  completeEvent,
  createEvent,
  deleteEvent,
  getEvent,
  listItems,
  uncompleteEvent,
  updateEvent,
} from '../service.ts';

const jst = (s: string) => new Date(`${s}+09:00`);
const iso = (s: string) => jst(s).toISOString();

// 「今日」を 2026-09-14（月）の正午に固定する
const now = jst('2026-09-14T12:00:00');
const september = dateRangeQuerySchema.parse({ from: '2026-09-01', to: '2026-09-30' });

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
    await truncateAll();
    userId = (await createUser({ email: 'a@example.com', name: 'A', password: 'password-123456' }))
      .id;
    partnerId = (
      await createUser({ email: 'b@example.com', name: 'B', password: 'password-123456' })
    ).id;
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

    it('予定には開始と終了が必須、参加者は 1 人以上', async () => {
      expect(() =>
        createEventSchema.parse({ kind: 'event', title: 'x', participantIds: [userId] }),
      ).toThrow();
      expect(() =>
        createEventSchema.parse({
          kind: 'event',
          title: 'x',
          startsAt: iso('2026-09-10T14:00:00'),
          endsAt: iso('2026-09-10T15:00:00'),
          participantIds: [],
        }),
      ).toThrow();
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
      const next = await updateEvent(
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
      expect(next.id).not.toBe(created.id);
      expect((await getEvent(created.id)).rrule).toBe('FREQ=WEEKLY;UNTIL=20260921T085959Z');

      const list = await listItems(september, now);
      expect(list.map((o) => [o.id, o.startsAt])).toEqual([
        [created.id, iso('2026-09-07T09:00:00')],
        [created.id, iso('2026-09-14T09:00:00')],
        [next.id, iso('2026-09-21T10:00:00')],
        [next.id, iso('2026-09-28T10:00:00')],
      ]);
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

    it('種別は変更できず、予定は完了にできない', async () => {
      const created = await createEvent(weekly(), userId);
      await expect(
        updateEvent(created.id, { ...weekly(), kind: 'task', scope: 'all' }, userId),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(completeEvent(created.id, {}, userId)).rejects.toBeInstanceOf(ValidationError);
    });
  });

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
        updateEventSchema.parse({ ...weeklyTask(), startsAt: iso('2026-09-08T09:00:00') }),
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
