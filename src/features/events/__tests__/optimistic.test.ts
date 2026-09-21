import { QueryClient } from '@tanstack/react-query';
import { expect, test } from 'vitest';
import type { CalendarItem } from '../../../../shared/calendar.ts';
import { today } from '../../../../shared/date.ts';
import type { DateString } from '../../../../shared/types.ts';
import { dateStringSchema } from '../../../../shared/validation/common.ts';
import { CALENDAR_QUERY_KEY } from '../../calendar/queries.ts';
import { insertItem, removeItem, setCompleted } from '../optimistic.ts';
import type { CreateEventBody } from '../queries.ts';

/** 期間のクエリを 1 つだけ持つキャッシュ */
function clientWith(from: DateString, to: DateString, items: CalendarItem[] = []) {
  const client = new QueryClient();
  client.setQueryData([...CALENDAR_QUERY_KEY, from, to], items);
  return client;
}

const itemsOf = (client: QueryClient): CalendarItem[] =>
  client.getQueriesData<CalendarItem[]>({ queryKey: CALENDAR_QUERY_KEY })[0]?.[1] ?? [];

const EVENT: CreateEventBody = {
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

const date = (value: string): DateString => dateStringSchema.parse(value);

test('終日の予定は終了日まで、期間に掛かる日だけに置かれる', () => {
  const client = clientWith(date('2030-05-03'), date('2030-05-10'));
  insertItem(client, EVENT, 'tmp');
  // 5/2〜5/4 の 3 日間のうち、期間に入る 5/3・5/4 が出る（終了日は含む）
  expect(itemsOf(client).map((item) => item.placementDate)).toEqual(['2030-05-03', '2030-05-04']);
  expect(itemsOf(client).map((item) => (item.kind === 'event' ? item.dayIndex : null))).toEqual([
    2, 3,
  ]);
});

test('期間に掛からない予定は置かれない', () => {
  const client = clientWith(date('2030-06-01'), date('2030-06-30'));
  insertItem(client, EVENT, 'tmp');
  expect(itemsOf(client)).toEqual([]);
});

test('日時の無いタスクは今日に置かれ、完了にすると完了した日へ移る', () => {
  const todayDate = today();
  const client = clientWith(todayDate, todayDate);
  insertItem(
    client,
    { ...EVENT, kind: 'task', startsAt: null, endsAt: null, allDay: false },
    'tmp',
  );
  expect(itemsOf(client).map((item) => item.placementDate)).toEqual([todayDate]);

  setCompleted(client, { id: 'tmp', scope: 'this' }, true);
  expect(itemsOf(client)[0]?.completedAt).not.toBeNull();

  removeItem(client, { id: 'tmp' });
  expect(itemsOf(client)).toEqual([]);
});
