import { describe, expect, it } from 'vitest';
import type { CalendarItem } from '../../../../shared/calendar.ts';
import { dateStringSchema } from '../../../../shared/validation/common.ts';

import { itemTransitionName } from '../item-transition.ts';

/** 予定の 1 日分。複数日は dayIndex / dayCount で日ごとに 1 件 */
function event(
  id: string,
  { occurrenceStart = null as string | null, dayIndex = 1, dayCount = 1 } = {},
): CalendarItem {
  return {
    id,
    kind: 'event',
    occurrenceStart,
    title: id,
    allDay: dayCount > 1,
    startsAt: '2026-09-21T00:00:00.000Z',
    endsAt: '2026-09-21T01:00:00.000Z',
    completedAt: null,
    location: null,
    note: null,
    participantIds: [],
    rrule: null,
    remindStartMinutes: null,
    remindEndMinutes: null,
    isRecurring: occurrenceStart !== null,
    isModified: false,
    placementDate: dateStringSchema.parse('2026-09-21'),
    dayIndex,
    dayCount,
  };
}

describe('itemTransitionName', () => {
  it('繰り返しは回ごとに違う名前（同じ名前が 2 つあると遷移が行われない）', () => {
    const first = itemTransitionName(event('a', { occurrenceStart: '2026-09-21T00:00:00.000Z' }));
    const second = itemTransitionName(event('a', { occurrenceStart: '2026-09-22T00:00:00.000Z' }));
    expect(first).not.toBe(second);
  });

  it('複数日の予定は初日だけに付ける（月グリッドの週の行、リストの日ごとの行で重複するため）', () => {
    expect(itemTransitionName(event('trip', { dayIndex: 1, dayCount: 3 }))).toBeDefined();
    expect(itemTransitionName(event('trip', { dayIndex: 2, dayCount: 3 }))).toBeUndefined();
  });

  it('CSS の識別子として使える文字だけになる', () => {
    const name = itemTransitionName(event('a', { occurrenceStart: '2026-09-21T09:30:00.000Z' }));
    expect(name).toMatch(/^[a-zA-Z][\w-]*$/);
  });
});
