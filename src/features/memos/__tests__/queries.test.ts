import { onlineManager } from '@tanstack/react-query';
import { act } from 'react';
import { afterEach, expect, test } from 'vitest';
import type { Memo } from '../../../../shared/memos.ts';
import type { TimelineEntry } from '../../../../shared/timeline.ts';
import { memoEntry } from '../../../../shared/timeline.ts';
import type { HistoryPage } from '../../../../shared/types.ts';
import { renderHook } from '../../../lib/__tests__/render-hook.ts';
import { queryClient } from '../../../lib/query-client.ts';
import { timelineHistory } from '../../timeline/queries.ts';
import { pinnedMemosQueryOptions, useAddMemo, usePinMemo } from '../queries.ts';

afterEach(() => {
  onlineManager.setOnline(true);
  queryClient.clear();
});

const timelineOf = () =>
  queryClient.getQueryData<{ pages: HistoryPage<TimelineEntry>[] }>([...timelineHistory.key, {}])
    ?.pages[0]?.items ?? [];

test('ログイン中のユーザーがまだ手元に無くても、書いたメモを先にタイムラインへ出す', async () => {
  // オフラインにして送らずに溜める（先回りだけを見る）
  onlineManager.setOnline(false);
  queryClient.setQueryData([...timelineHistory.key, {}], {
    pages: [{ items: [], nextCursor: null }],
    pageParams: [undefined],
  });
  const { read, unmount } = renderHook(useAddMemo, { client: queryClient });
  await act(() => read().mutateAsync({ body: '買い物のメモ' }));

  expect(timelineOf()).toMatchObject([
    { type: 'memo', memo: { body: '買い物のメモ', createdBy: null } },
  ]);
  unmount();
});

const memo = (id: string, createdAt: string, pinned = false): Memo => ({
  id,
  body: id,
  createdBy: 'u1',
  mcpClientName: null,
  createdAt,
  pinned,
});

test('ピン止めするとタイムラインから一番上の並び（書いた時刻の新しい順）へ移り、外すと戻る', async () => {
  onlineManager.setOnline(false);
  const old = memo('old', '2030-05-01T00:00:00.000Z', true);
  const target = memo('target', '2030-05-02T00:00:00.000Z');
  queryClient.setQueryData([...timelineHistory.key, {}], {
    pages: [{ items: [memoEntry(target)], nextCursor: null }],
    pageParams: [undefined],
  });
  queryClient.setQueryData(pinnedMemosQueryOptions.queryKey, [old]);
  const { read, unmount } = renderHook(usePinMemo, { client: queryClient });
  const pinnedIds = () =>
    queryClient.getQueryData(pinnedMemosQueryOptions.queryKey)?.map((m) => m.id);

  await act(() => read().mutateAsync({ id: 'target', pinned: true }));
  expect(pinnedIds()).toEqual(['target', 'old']);
  expect(timelineOf()).toEqual([]);

  await act(() => read().mutateAsync({ id: 'target', pinned: false }));
  expect(pinnedIds()).toEqual(['old']);
  expect(timelineOf()).toEqual([memoEntry(target)]);
  unmount();
});
