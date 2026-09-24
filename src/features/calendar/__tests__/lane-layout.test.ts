import { describe, expect, it } from 'vitest';
import type { DateString } from '../../../../shared/types.ts';
import { dateStringSchema } from '../../../../shared/validation/common.ts';
import type { CalendarItem } from '../../events/queries.ts';
import { completedLast, foldLanes, freeLane, layoutLanes } from '../lane-layout.ts';

const days = ['2026-09-21', '2026-09-22', '2026-09-23'].map((d) => dateStringSchema.parse(d));

/** 予定とタスクに共通の項目（`Occurrence`） */
const BASE = {
  occurrenceStart: null,
  allDay: false,
  startsAt: null,
  endsAt: null,
  completedAt: null,
  location: null,
  note: null,
  participantIds: [],
  rrule: null,
  remindStartMinutes: null,
  remindEndMinutes: null,
  isRecurring: false,
  isModified: false,
};

/** 予定の項目。複数日は日ごとに 1 件（dayIndex / dayCount）で渡す */
function event(id: string, day: DateString, dayIndex = 1, dayCount = 1): CalendarItem {
  return {
    ...BASE,
    id,
    kind: 'event',
    title: id,
    allDay: dayCount > 1,
    startsAt: `${day}T00:00:00.000Z`,
    endsAt: `${day}T01:00:00.000Z`,
    placementDate: day,
    dayIndex,
    dayCount,
  };
}

/** タスクの項目。completedAt があれば完了している */
function task(id: string, day: DateString, completedAt: string | null): CalendarItem {
  return {
    ...BASE,
    id,
    title: id,
    placementDate: day,
    kind: 'task',
    completedAt,
    isOverdue: false,
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

describe('foldLanes', () => {
  const [d1, d2, d3] = days as [DateString, DateString, DateString];
  // レーン 0: trip（1〜2 日目）と c、レーン 1: a と d、レーン 2: b
  const placed = layoutLanes(
    days,
    byDate([
      event('trip', d1, 1, 2),
      event('a', d1),
      event('b', d1),
      event('trip', d2, 2, 2),
      event('d', d2),
      event('c', d3),
    ]),
  );

  it('入りきるなら畳まない', () => {
    const folded = foldLanes(placed, 3, days.length);
    expect(folded.visible).toHaveLength(placed.length);
    expect(folded.foldedLane).toBe(3);
    expect(folded.foldedPerCol).toEqual([0, 0, 0]);
  });

  it('入りきらなければ最後のレーンを「+n」に譲り、そこから下を列ごとに数える', () => {
    const folded = foldLanes(placed, 2, days.length);
    expect(folded.foldedLane).toBe(1);
    expect(folded.visible.map((p) => p.item.title)).toEqual(['trip', 'c']);
    expect(folded.foldedPerCol).toEqual([2, 1, 0]);
  });

  it('畳んだ複数日の帯は掛かる列すべてに数える', () => {
    const folded = foldLanes(placed, 1, days.length);
    expect(folded.visible).toEqual([]);
    expect(folded.foldedPerCol).toEqual([3, 2, 1]);
  });
});

describe('completedLast', () => {
  const [d1] = days as [DateString, DateString, DateString];
  const items = byDate([
    task('完了', d1, '2026-09-21T00:00:00.000Z'),
    event('予定', d1),
    task('未完了', d1, null),
  ]);

  it('完了したタスクは日ごとに一番後ろへ回り、他の順は変わらない', () => {
    expect(
      completedLast(items)
        .get(d1)
        ?.map((i) => i.title),
    ).toEqual(['予定', '未完了', '完了']);
  });

  it('レーンも一番下になる（入りきらないときに先に畳まれる）', () => {
    const placed = layoutLanes(days, completedLast(items));
    expect(placed.map((p) => [p.item.title, p.lane])).toEqual([
      ['予定', 0],
      ['未完了', 1],
      ['完了', 2],
    ]);
  });
});
