import { describe, expect, it } from 'vitest';
import type { CalendarItem } from '../../../../shared/calendar.ts';
import type { DateString } from '../../../../shared/types.ts';
import { activeFilterCount, type ListFilters, matchesListFilters } from '../search.ts';

const DAY = '2031-06-05' as DateString;
const NONE: ListFilters = {
  from: undefined,
  to: undefined,
  kind: undefined,
  participant: undefined,
  completed: undefined,
  q: '',
};

const task = (completedAt: string | null): CalendarItem => ({
  id: 't',
  kind: 'task',
  title: '買い物',
  allDay: false,
  startsAt: null,
  endsAt: null,
  completedAt,
  location: 'スーパー',
  note: null,
  participantIds: ['me'],
  rrule: null,
  remindStartMinutes: null,
  remindEndMinutes: null,
  occurrenceStart: null,
  isRecurring: false,
  isModified: false,
  placementDate: DAY,
  isOverdue: false,
});

describe('matchesListFilters', () => {
  it('種別・参加者・完了状態・キーワードのすべてに当たるものだけ', () => {
    const open = task(null);
    const done = task('2031-06-05T01:00:00.000Z');
    expect(matchesListFilters(open, NONE)).toBe(true);
    expect(matchesListFilters(open, { ...NONE, kind: 'event' })).toBe(false);
    expect(matchesListFilters(open, { ...NONE, participant: 'partner' })).toBe(false);
    expect(matchesListFilters(open, { ...NONE, completed: 'done' })).toBe(false);
    expect(matchesListFilters(done, { ...NONE, completed: 'open' })).toBe(false);
    // キーワードは場所にも当たる
    expect(matchesListFilters(open, { ...NONE, q: 'スーパー' })).toBe(true);
  });
});

describe('activeFilterCount', () => {
  it('期間は両端で 1 つに数え、キーワードは数えない', () => {
    expect(activeFilterCount(NONE)).toBe(0);
    expect(activeFilterCount({ ...NONE, from: DAY, to: DAY, kind: 'task', q: 'a' })).toBe(2);
  });
});
