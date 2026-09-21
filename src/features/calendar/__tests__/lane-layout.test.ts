import { describe, expect, it } from 'vitest';
import type { DateString } from '../../../../shared/types.ts';
import { dateStringSchema } from '../../../../shared/validation/common.ts';
import { freeLane, layoutLanes } from '../components/lane-layout.ts';
import type { CalendarItem } from '../queries.ts';

const days = ['2026-09-21', '2026-09-22', '2026-09-23'].map((d) => dateStringSchema.parse(d));

/** 予定の項目。複数日は日ごとに 1 件（dayIndex / dayCount）で渡す */
function event(id: string, day: DateString, dayIndex = 1, dayCount = 1): CalendarItem {
  return {
    id,
    kind: 'event',
    occurrenceStart: null,
    title: id,
    allDay: dayCount > 1,
    startsAt: `${day}T00:00:00.000Z`,
    endsAt: `${day}T01:00:00.000Z`,
    completedAt: null,
    location: null,
    note: null,
    participantIds: [],
    rrule: null,
    remindStartMinutes: null,
    remindEndMinutes: null,
    isRecurring: false,
    isModified: false,
    placementDate: day,
    dayIndex,
    dayCount,
  };
}

const byDate = (items: CalendarItem[]) => {
  const map = new Map<DateString, CalendarItem[]>();
  for (const item of items)
    map.set(item.placementDate, [...(map.get(item.placementDate) ?? []), item]);
  return map;
};

describe('layoutLanes', () => {
  it('複数日の予定は 1 本の帯にまとめ、日ごとの項目は空いたレーンに詰める', () => {
    const [d1, d2, d3] = days as [DateString, DateString, DateString];
    const placed = layoutLanes(
      days,
      byDate([event('trip', d1, 1, 2), event('a', d1), event('trip', d2, 2, 2), event('b', d3)]),
    );
    expect(placed.map((p) => [p.item.title, p.col, p.span, p.lane])).toEqual([
      ['trip', 0, 2, 0],
      ['a', 0, 1, 1],
      ['b', 2, 1, 0],
    ]);
  });

  it('週をまたぐ帯は端を角丸にしない', () => {
    const [d1] = days as [DateString, DateString, DateString];
    const placed = layoutLanes(days, byDate([event('trip', d1, 3, 5)]));
    expect(placed.map((p) => [p.roundStart, p.roundEnd])).toEqual([[false, false]]);
  });
});

describe('freeLane', () => {
  const [d1, , d3] = days as [DateString, DateString, DateString];
  const placed = layoutLanes(
    days,
    byDate([event('trip', d1, 1, 2), event('a', d1), event('b', d3)]),
  );

  it('掛かる列が空いている一番上のレーンに置く', () => {
    // trip がレーン 0、a がレーン 1 を使う 1〜2 日目と、何も無い 3 日目
    expect(freeLane(placed, 0, 2, 4)).toBe(2);
    expect(freeLane(placed, 2, 1, 4)).toBe(1);
  });

  it('空きが無ければ一番下のレーンに重ねる', () => {
    expect(freeLane(placed, 0, 1, 2)).toBe(1);
  });
});
