import { describe, expect, it } from 'vitest';
import { type CalendarItem, placeOccurrence, sortItems } from '../calendar.ts';
import type { DateString } from '../types.ts';

const BASE = {
  completedAt: null,
  location: null,
  note: null,
  participantIds: ['u1'],
  rrule: null,
  remindStartMinutes: null,
  remindEndMinutes: null,
  occurrenceStart: null,
  isRecurring: false,
  isModified: false,
};

const day = '2026-09-21' as DateString;

function event(title: string, startsAt: string, endsAt: string, allDay = false): CalendarItem {
  return {
    ...BASE,
    id: title,
    kind: 'event',
    title,
    allDay,
    startsAt,
    endsAt,
    placementDate: day,
    dayIndex: 1,
    dayCount: 1,
  };
}

function task(title: string, startsAt: string | null, endsAt: string | null): CalendarItem {
  return {
    ...BASE,
    id: title,
    kind: 'task',
    title,
    allDay: false,
    startsAt,
    endsAt,
    placementDate: day,
    isOverdue: false,
  };
}

describe('sortItems', () => {
  it('同日内は 終日の予定 → 時刻のある項目 → 時刻の無いタスク の順に並ぶ', () => {
    const items = [
      task('時刻なしタスク', null, null),
      event('10 時の予定', '2026-09-21T01:00:00.000Z', '2026-09-21T02:00:00.000Z'),
      event('終日の予定', '2026-09-20T15:00:00.000Z', '2026-09-21T15:00:00.000Z', true),
      task('9 時期限のタスク', null, '2026-09-21T00:00:00.000Z'),
    ];
    expect(sortItems(items).map((i) => i.title)).toEqual([
      '終日の予定',
      '9 時期限のタスク',
      '10 時の予定',
      '時刻なしタスク',
    ]);
  });

  it('開始と期限の両方を持つタスクは、表示と同じ期限の時刻に並ぶ', () => {
    const items = [
      event('11 時の予定', '2026-09-21T02:00:00.000Z', '2026-09-21T03:00:00.000Z'),
      // 9 時開始・18 時期限。一覧の行もタイムラインのブロックも期限（18 時）を指すので、並びも 18 時
      task('18 時期限のタスク', '2026-09-21T00:00:00.000Z', '2026-09-21T09:00:00.000Z'),
    ];
    expect(sortItems(items).map((i) => i.title)).toEqual(['11 時の予定', '18 時期限のタスク']);
  });

  it('完了したタスクは、表示と同じ完了の時刻に並ぶ', () => {
    const items = [
      event('11 時の予定', '2026-09-21T02:00:00.000Z', '2026-09-21T03:00:00.000Z'),
      // 前日 9 時期限を 20 時に完了。完了した日に置かれ、行もその日の時間軸も完了の時刻を指すので、並びも 20 時
      {
        ...task('前日期限で 20 時に完了したタスク', null, '2026-09-20T00:00:00.000Z'),
        completedAt: '2026-09-21T11:00:00.000Z',
      },
    ];
    expect(sortItems(items).map((i) => i.title)).toEqual([
      '11 時の予定',
      '前日期限で 20 時に完了したタスク',
    ]);
  });

  it('終日のタスクは期限の 0:00 ではなく、終日の項目として先頭に並ぶ', () => {
    const items = [
      event('10 時の予定', '2026-09-21T01:00:00.000Z', '2026-09-21T02:00:00.000Z'),
      // 9/21 が期限の終日のタスク（保存上の期限は翌日 0:00）
      { ...task('終日のタスク', null, '2026-09-21T15:00:00.000Z'), allDay: true },
    ];
    expect(sortItems(items).map((i) => i.title)).toEqual(['終日のタスク', '10 時の予定']);
  });

  it('日付が違えば placementDate 順に並ぶ', () => {
    const later = { ...task('翌日', null, null), placementDate: '2026-09-22' as DateString };
    const earlier = { ...event('前日', '2026-09-20T01:00:00.000Z', '2026-09-20T02:00:00.000Z') };
    const items = [later, { ...earlier, placementDate: '2026-09-20' as DateString }];
    expect(sortItems(items).map((i) => i.title)).toEqual(['前日', '翌日']);
  });
});

describe('placeOccurrence', () => {
  it('複数日の予定は掛かる日ごとに 1 件になる（範囲外の日は除く）', () => {
    const occurrence = {
      ...BASE,
      id: 'e1',
      kind: 'event' as const,
      title: '旅行',
      allDay: true,
      // 9/21 0:00 JST 〜 9/24 0:00 JST（終端は排他的 = 9/23 まで）
      startsAt: '2026-09-20T15:00:00.000Z',
      endsAt: '2026-09-23T15:00:00.000Z',
    };
    const items = placeOccurrence(
      occurrence,
      { from: '2026-09-22' as DateString, to: '2026-09-30' as DateString },
      new Date('2026-09-21T03:00:00.000Z'),
    );
    expect(items.map((i) => i.placementDate)).toEqual(['2026-09-22', '2026-09-23']);
    expect(items.map((i) => (i.kind === 'event' ? i.dayIndex : null))).toEqual([2, 3]);
    expect(items.every((i) => i.kind === 'event' && i.dayCount === 3)).toBe(true);
  });
});
