import { describe, expect, it } from 'vitest';
import type { CalendarItem } from '../../../../shared/calendar.ts';
import type { DateString } from '../../../../shared/types.ts';
import { layoutTimed, partitionTimeline, timedSpan } from '../timeline-layout.ts';

const block = (key: string, startMin: number, endMin: number) => ({
  key,
  item: key,
  startMin,
  endMin,
});

describe('layoutTimed', () => {
  it('重ならなければ全項目が 1 列', () => {
    const placed = layoutTimed([block('a', 540, 600), block('b', 600, 660)]);
    expect(placed.map((p) => [p.key, p.col, p.cols])).toEqual([
      ['a', 0, 1],
      ['b', 0, 1],
    ]);
  });

  it('重なる項目は同じクラスタで列を分け、幅を等分する', () => {
    const placed = layoutTimed([block('a', 540, 660), block('b', 570, 630), block('c', 720, 780)]);
    const byKey = Object.fromEntries(placed.map((p) => [p.key, p]));
    expect(byKey.a).toMatchObject({ col: 0, cols: 2 });
    expect(byKey.b).toMatchObject({ col: 1, cols: 2 });
    expect(byKey.c).toMatchObject({ col: 0, cols: 1 });
  });

  it('列が空けば再利用する', () => {
    const placed = layoutTimed([block('a', 540, 600), block('b', 560, 700), block('c', 610, 650)]);
    const byKey = Object.fromEntries(placed.map((p) => [p.key, p]));
    expect(byKey.c).toMatchObject({ col: 0, cols: 2 });
  });

  it('短い項目でも最小の長さで重なりを判定し、返す endMin は元のまま', () => {
    const placed = layoutTimed([block('a', 540, 545), block('b', 550, 560)]);
    expect(placed.every((p) => p.cols === 2)).toBe(true);
    expect(placed.find((p) => p.key === 'a')?.endMin).toBe(545);
  });
});

describe('partitionTimeline', () => {
  const DAY = '2031-06-05' as DateString;
  const BASE = {
    completedAt: null,
    location: null,
    note: null,
    participantIds: [],
    rrule: null,
    remindStartMinutes: null,
    remindEndMinutes: null,
    occurrenceStart: null,
    isRecurring: false,
    isModified: false,
    placementDate: DAY,
  };
  const event = (id: string, startsAt: string, endsAt: string, extra = {}): CalendarItem => ({
    ...BASE,
    id,
    kind: 'event',
    title: id,
    allDay: false,
    startsAt,
    endsAt,
    dayIndex: 1,
    dayCount: 1,
    ...extra,
  });
  const task = (
    id: string,
    endsAt: string | null,
    allDay = false,
    startsAt: string | null = null,
  ): CalendarItem => ({
    ...BASE,
    id,
    kind: 'task',
    title: id,
    allDay,
    startsAt,
    endsAt,
    isOverdue: false,
  });

  const items = [
    event('meeting', '2031-06-05T09:00:00+09:00', '2031-06-05T10:30:00+09:00'),
    // 24:00 に終わる予定は翌日 0:00 で届く
    event('late', '2031-06-05T23:00:00+09:00', '2031-06-06T00:00:00+09:00'),
    event('holiday', '2031-06-05T00:00:00+09:00', '2031-06-06T00:00:00+09:00', { allDay: true }),
    event('trip', '2031-06-04T09:00:00+09:00', '2031-06-05T18:00:00+09:00', {
      dayIndex: 2,
      dayCount: 2,
    }),
    task('due', '2031-06-05T15:00:00+09:00'),
    // 開始があれば期限ではなく開始の時刻に置く
    task('started', '2031-06-05T20:00:00+09:00', false, '2031-06-05T11:00:00+09:00'),
    // 開始が別の日（繰り越し）なら、期限がその日の時刻でも時間軸には置かない
    task('carried', '2031-06-05T17:00:00+09:00', false, '2031-06-01T11:00:00+09:00'),
    task('someday', null),
    task('dated', '2031-06-06T00:00:00+09:00', true),
  ];
  const { allDayByDate, timedByDate } = partitionTimeline([DAY], new Map([[DAY, items]]));

  it('時刻のある予定・タスクは時間軸、それ以外は終日欄に分ける', () => {
    expect(allDayByDate.get(DAY)?.map((item) => item.id)).toEqual([
      'holiday',
      'trip',
      'carried',
      'someday',
      'dated',
    ]);
    expect(timedByDate.get(DAY)?.map((p) => [p.item.id, p.startMin, p.endMin])).toEqual([
      ['meeting', 9 * 60, 10 * 60 + 30],
      ['started', 11 * 60, 11 * 60 + 30],
      ['due', 15 * 60, 15 * 60 + 30],
      ['late', 23 * 60, 24 * 60],
    ]);
  });
});

describe('timedSpan', () => {
  it('どの日の項目も含めて、一番早い開始から一番遅い終了まで', () => {
    const timedByDate = new Map([
      ['2026-09-21' as DateString, layoutTimed([block('a', 600, 660)])],
      ['2026-09-22' as DateString, layoutTimed([block('b', 540, 570), block('c', 1200, 1260)])],
      ['2026-09-23' as DateString, []],
    ]);
    expect(timedSpan(timedByDate)).toEqual({ startMin: 540, endMin: 1260 });
  });

  it('時間軸に項目が無ければ null', () => {
    expect(timedSpan(new Map([['2026-09-21' as DateString, []]]))).toBeNull();
  });
});
