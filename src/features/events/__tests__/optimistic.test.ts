import { QueryClient } from '@tanstack/react-query';
import { expect, test } from 'vitest';
import type { CalendarItem, CalendarPeriod } from '../../../../shared/calendar.ts';
import { addDays, startOfDate, today } from '../../../../shared/date.ts';
import { toMonthString } from '../../../lib/date.ts';
import { insertItem, removeItem, setCompleted, updateItem } from '../optimistic.ts';
import type { CreateEventBody } from '../queries.ts';
import { CALENDAR_QUERY_KEY } from '../query-keys.ts';
import { writeTarget } from '../recurrence-options.ts';

/** その暦月のクエリを 1 つだけ持つキャッシュ */
function clientWith(month: string, items: CalendarItem[] = []) {
  const client = new QueryClient();
  client.setQueryData<CalendarPeriod>([...CALENDAR_QUERY_KEY, month], {
    items,
    holidays: [],
    weather: { daily: [], hourly: [] },
  });
  return client;
}

const itemsOf = (client: QueryClient): CalendarItem[] =>
  client.getQueriesData<CalendarPeriod>({ queryKey: CALENDAR_QUERY_KEY })[0]?.[1]?.items ?? [];

const EVENT: CreateEventBody & { id: string } = {
  id: 'tmp',
  kind: 'event',
  title: '旅行',
  allDay: true,
  startsAt: '2030-05-02T00:00:00+09:00',
  endsAt: '2030-05-04T00:00:00+09:00',
  participantIds: ['11111111-1111-4111-8111-111111111111'],
  location: null,
  note: null,
  rrule: null,
  remindStartMinutes: null,
  remindEndMinutes: null,
};

/** EVENT と同じ id・タイトル・参加者の、時刻のあるタスク */
function taskBody(startsAt: string): CreateEventBody & { id: string } {
  const { id, title, participantIds } = EVENT;
  return { id, kind: 'task', title, allDay: false, startsAt, participantIds };
}

test('終日の予定は終了日まで、掛かる日ごとに置かれる', () => {
  const client = clientWith('2030-05');
  insertItem(client, EVENT);
  // 5/2〜5/4 の 3 日間（終了日は含む）にそれぞれ 1 件ずつ
  expect(itemsOf(client).map((item) => item.placementDate)).toEqual([
    '2030-05-02',
    '2030-05-03',
    '2030-05-04',
  ]);
  expect(itemsOf(client).map((item) => (item.kind === 'event' ? item.dayIndex : null))).toEqual([
    1, 2, 3,
  ]);
});

test('その月に掛からない予定は置かれない', () => {
  const client = clientWith('2030-06');
  insertItem(client, EVENT);
  expect(itemsOf(client)).toEqual([]);
});

test('開始を過ぎたタスクは今日に置かれ、完了にすると完了した日へ移る', () => {
  const todayDate = today();
  const client = clientWith(toMonthString(todayDate));
  const started = startOfDate(addDays(todayDate, -3)).toISOString();
  insertItem(client, taskBody(started));
  expect(itemsOf(client).map((item) => item.placementDate)).toEqual([todayDate]);

  setCompleted(client, { id: 'tmp', scope: 'all' }, new Date().toISOString());
  expect(itemsOf(client)[0]?.completedAt).not.toBeNull();

  removeItem(client, { id: 'tmp', scope: 'all' });
  expect(itemsOf(client)).toEqual([]);
});

test('完了したタスクを予定に変えると、完了が外れて予定として置かれる', () => {
  const client = clientWith('2030-05');
  insertItem(client, taskBody(EVENT.startsAt));
  setCompleted(client, { id: 'tmp', scope: 'all' }, '2030-05-01T09:00:00+09:00');
  updateItem(client, { ...EVENT, scope: 'all' });
  expect(itemsOf(client).map((item) => [item.kind, item.completedAt])).toEqual([
    ['event', null],
    ['event', null],
    ['event', null],
  ]);
});

/** 毎日 10:00〜11:00 の繰り返し予定の 1 回（サーバーが展開して返した形） */
function dailyOccurrence(date: string): CalendarItem {
  const startsAt = new Date(`${date}T10:00:00+09:00`).toISOString();
  return {
    id: 'daily',
    kind: 'event',
    title: '朝会',
    allDay: false,
    startsAt,
    endsAt: new Date(`${date}T11:00:00+09:00`).toISOString(),
    completedAt: null,
    location: null,
    note: null,
    participantIds: EVENT.participantIds,
    rrule: 'FREQ=DAILY',
    remindStartMinutes: null,
    remindEndMinutes: null,
    occurrenceStart: startsAt,
    isRecurring: true,
    isModified: false,
    placementDate: date as CalendarItem['placementDate'],
    dayIndex: 1,
    dayCount: 1,
  };
}

test('繰り返しの「この回だけ」の日時の変更は、その回だけをその場で動かす', () => {
  const first = dailyOccurrence('2030-05-02');
  const second = dailyOccurrence('2030-05-03');
  const client = clientWith('2030-05', [first, second]);
  updateItem(client, {
    ...EVENT,
    title: '朝会（延長）',
    allDay: false,
    // 2 日目の回を翌日の 13:00〜14:00 へ
    startsAt: '2030-05-04T13:00:00+09:00',
    endsAt: '2030-05-04T14:00:00+09:00',
    rrule: 'FREQ=DAILY',
    ...writeTarget(second, 'this'),
  });
  const items = itemsOf(client);
  // 1 日目の回はそのまま
  expect(items[0]).toEqual(first);
  expect(items).toHaveLength(2);
  expect(items[1]).toMatchObject({
    id: 'daily',
    title: '朝会（延長）',
    placementDate: '2030-05-04',
    startsAt: new Date('2030-05-04T13:00:00+09:00').toISOString(),
    // どの回かは元の基準日時のまま（再取得で同じ回として届く）
    occurrenceStart: second.occurrenceStart,
    rrule: 'FREQ=DAILY',
    isRecurring: true,
    isModified: true,
  });
});
