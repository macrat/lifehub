import { QueryClient } from '@tanstack/react-query';
import { expect, test } from 'vitest';
import type { Memo } from '../../../../shared/memos.ts';
import { memoEntry, type TimelineEntry } from '../../../../shared/timeline.ts';
import type { HistoryPage } from '../../../../shared/types.ts';
import type { HistorySource } from '../../../lib/history.ts';
import { TIMELINE_QUERY_KEY, timelineRecordCache } from '../queries.ts';

const memo = (id: string, body: string): Memo => ({
  id,
  body,
  createdBy: 'u1',
  createdAt: '2030-05-02T03:00:00.000Z',
});

/** 絞り込みの無い 1 ページだけを読んだ状態 */
function pagesOf<T>(items: T[]) {
  return { pages: [{ items, nextCursor: null } satisfies HistoryPage<T>], pageParams: [undefined] };
}

const memoHistory: HistorySource<Memo, object> = {
  key: ['memo-history'],
  fetch: () => Promise.reject(new Error('読まない')),
  dayOf: (m) => m.createdAt.slice(0, 10),
  sort: (items) => items,
};

function clientWith(timeline: Memo[], history?: Memo[]) {
  const client = new QueryClient();
  client.setQueryData([...TIMELINE_QUERY_KEY, {}], pagesOf(timeline.map(memoEntry)));
  if (history) client.setQueryData([...memoHistory.key, {}], pagesOf(history));
  return client;
}

const timelineOf = (client: QueryClient) =>
  client.getQueryData<{ pages: HistoryPage<TimelineEntry>[] }>([...TIMELINE_QUERY_KEY, {}])
    ?.pages[0]?.items;

test('前の値は自分の履歴を先に探し、無ければタイムラインの控えを使う', () => {
  const cache = timelineRecordCache('memo', memoHistory);
  const client = clientWith(
    [memo('a', 'タイムライン'), memo('b', 'タイムラインだけ')],
    [memo('a', '履歴')],
  );
  expect(cache.find(client, 'a')?.body).toBe('履歴');
  expect(cache.find(client, 'b')?.body).toBe('タイムラインだけ');
  expect(cache.find(client, 'c')).toBeUndefined();
});

test('変化は履歴とタイムラインの両方に同じ規則で書き込み、削除はどちらからも除く', () => {
  const cache = timelineRecordCache('memo', memoHistory);
  const client = clientWith([memo('a', '前')], [memo('a', '前')]);
  cache.apply(client, 'a', memo('a', '後'));
  expect(cache.find(client, 'a')?.body).toBe('後');
  expect(timelineOf(client)).toEqual([memoEntry(memo('a', '後'))]);

  cache.apply(client, 'a', null);
  expect(cache.find(client, 'a')).toBeUndefined();
  expect(timelineOf(client)).toEqual([]);
});

test('履歴を持たない記録はタイムラインだけを読み書きする', () => {
  const cache = timelineRecordCache('memo');
  const client = clientWith([]);
  cache.apply(client, 'a', memo('a', '新規'));
  expect(timelineOf(client)).toEqual([memoEntry(memo('a', '新規'))]);
  expect(cache.find(client, 'a')?.body).toBe('新規');
});
