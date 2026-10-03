import { onlineManager, QueryClientProvider } from '@tanstack/react-query';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test } from 'vitest';
import type { Memo } from '../../../../shared/memos.ts';
import type { TimelineEntry } from '../../../../shared/timeline.ts';
import { memoEntry } from '../../../../shared/timeline.ts';
import type { HistoryPage } from '../../../../shared/types.ts';
import { queryClient } from '../../../lib/query-client.ts';
import { TIMELINE_QUERY_KEY } from '../../timeline/queries.ts';
import { pinnedMemosQueryOptions, useAddMemo, usePinMemo } from '../queries.ts';

// React の act を使う（テスト用の描画ライブラリは入れていない）
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  onlineManager.setOnline(true);
  queryClient.clear();
});

const timelineOf = () =>
  queryClient.getQueryData<{ pages: HistoryPage<TimelineEntry>[] }>([...TIMELINE_QUERY_KEY, {}])
    ?.pages[0]?.items ?? [];

test('ログイン中のユーザーがまだ手元に無くても、書いたメモを先にタイムラインへ出す', async () => {
  // オフラインにして送らずに溜める（先回りだけを見る）
  onlineManager.setOnline(false);
  queryClient.setQueryData([...TIMELINE_QUERY_KEY, {}], {
    pages: [{ items: [], nextCursor: null }],
    pageParams: [undefined],
  });
  let add!: ReturnType<typeof useAddMemo>;
  function Probe() {
    add = useAddMemo();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() =>
    root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe))),
  );
  await act(() => add.mutateAsync({ body: '買い物のメモ' }));

  expect(timelineOf()).toMatchObject([
    { type: 'memo', memo: { body: '買い物のメモ', createdBy: null } },
  ]);
  act(() => root.unmount());
});

const memo = (id: string, createdAt: string, pinned = false): Memo => ({
  id,
  body: id,
  createdBy: 'u1',
  createdAt,
  pinned,
});

test('ピン止めするとタイムラインから一番上の並び（書いた時刻の新しい順）へ移り、外すと戻る', async () => {
  onlineManager.setOnline(false);
  const old = memo('old', '2030-05-01T00:00:00.000Z', true);
  const target = memo('target', '2030-05-02T00:00:00.000Z');
  queryClient.setQueryData([...TIMELINE_QUERY_KEY, {}], {
    pages: [{ items: [memoEntry(target)], nextCursor: null }],
    pageParams: [undefined],
  });
  queryClient.setQueryData(pinnedMemosQueryOptions.queryKey, [old]);
  let pin!: ReturnType<typeof usePinMemo>;
  function Probe() {
    pin = usePinMemo();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() =>
    root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe))),
  );
  const pinnedIds = () =>
    queryClient.getQueryData(pinnedMemosQueryOptions.queryKey)?.map((m) => m.id);

  await act(() => pin.mutateAsync({ id: 'target', pinned: true }));
  expect(pinnedIds()).toEqual(['target', 'old']);
  expect(timelineOf()).toEqual([]);

  await act(() => pin.mutateAsync({ id: 'target', pinned: false }));
  expect(pinnedIds()).toEqual(['old']);
  expect(timelineOf()).toEqual([memoEntry(target)]);
  act(() => root.unmount());
});
