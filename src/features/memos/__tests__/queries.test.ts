import { onlineManager, QueryClientProvider } from '@tanstack/react-query';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test } from 'vitest';
import type { TimelineEntry } from '../../../../shared/timeline.ts';
import type { HistoryPage } from '../../../../shared/types.ts';
import { queryClient } from '../../../lib/query-client.ts';
import { TIMELINE_QUERY_KEY } from '../../timeline/queries.ts';
import { useAddMemo } from '../queries.ts';

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
