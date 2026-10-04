import { describe, expect, it } from 'vitest';
import type { CalendarItem } from '../../../../shared/calendar.ts';
import type { DateString } from '../../../../shared/types.ts';
import { countActiveFilters } from '../../../lib/search.ts';
import {
  type CalendarSearch,
  LIST_FILTER_CONDITIONS,
  type ListFilters,
  listSections,
  matchesListFilters,
} from '../search.ts';

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
  startsAt: '2031-06-05T00:00:00.000Z',
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

describe('LIST_FILTER_CONDITIONS', () => {
  it('期間は両端で 1 つに数え、キーワードは数えない', () => {
    const search: CalendarSearch = { view: 'list' };
    expect(countActiveFilters(search, LIST_FILTER_CONDITIONS)).toBe(0);
    expect(
      countActiveFilters(
        { ...search, from: DAY, to: DAY, kind: 'task', q: 'a' },
        LIST_FILTER_CONDITIONS,
      ),
    ).toBe(2);
  });
});

describe('listSections', () => {
  const on = (placementDate: string, title = '買い物'): CalendarItem => ({
    ...task(null),
    id: placementDate,
    title,
    placementDate: placementDate as DateString,
  });
  const range = { from: '2031-06-01' as DateString, to: '2031-07-31' as DateString };

  it('絞り込みに当たる項目を日ごと・月ごとにまとめ、項目の無い月も見出しだけ並べる', () => {
    const items = [on('2031-06-20'), on('2031-06-03'), on('2031-06-10', '散歩')];
    const sections = listSections(
      items,
      { ...NONE, q: '買い' },
      { months: ['2031-06', '2031-07'], date: '2031-06-03' as DateString, range },
    );
    expect(sections.map(({ month, days }) => [month, days.map(([day]) => day)])).toEqual([
      ['2031-06', ['2031-06-03', '2031-06-20']],
      ['2031-07', []],
    ]);
  });

  it('基準の日は期間の中なら項目が無くても空の日として入れる', () => {
    const date = '2031-06-15' as DateString;
    const [june] = listSections([], NONE, { months: ['2031-06'], date, range });
    expect(june?.days).toEqual([[date, []]]);
    const outside = listSections([], NONE, {
      months: ['2031-06'],
      date: '2031-09-01' as DateString,
      range,
    });
    expect(outside[0]?.days).toEqual([]);
  });
});
