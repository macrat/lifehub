import { memoEntry, timelineEntryId } from '../../../shared/timeline.ts';
import type { MemoInput } from '../../../shared/validation/memos.ts';
import { api } from '../../lib/api.ts';
import { meQueryOptions } from '../../lib/auth.ts';
import { useCreateMutation, useOptimisticMutation } from '../../lib/query-client.ts';
import { applyToTimeline, findTimelineRecord } from '../timeline/queries.ts';
import { TIMELINE_QUERY_KEY } from '../timeline/query-key.ts';

/** メモの形はサーバーと共有する（shared/memos.ts） */
export type { Memo } from '../../../shared/memos.ts';

/** メモを読むのはタイムラインだけなので、書き込みが変えるのもタイムラインだけ */
const WRITE_KEYS = [TIMELINE_QUERY_KEY];

export function useAddMemo() {
  return useCreateMutation<MemoInput>({
    request: (input) => ({
      method: 'POST' as const,
      path: api.memos.$url().pathname,
      body: input,
    }),
    keys: WRITE_KEYS,
    apply: (client, { id, body }) => {
      const createdBy = client.getQueryData(meQueryOptions.queryKey)?.id;
      if (!createdBy) return;
      const memo = { id, body, createdBy, createdAt: new Date().toISOString() };
      applyToTimeline(client, timelineEntryId('memo', id), memoEntry(memo));
    },
  });
}

export function useUpdateMemo() {
  return useOptimisticMutation({
    request: ({ id, ...input }: MemoInput & { id: string }) => ({
      method: 'PUT' as const,
      path: api.memos[':id'].$url({ param: { id } }).pathname,
      body: input,
    }),
    keys: WRITE_KEYS,
    apply: (client, { id, body }) => {
      const prev = findTimelineRecord(client, 'memo', id);
      if (prev) applyToTimeline(client, timelineEntryId('memo', id), memoEntry({ ...prev, body }));
    },
  });
}

export function useDeleteMemo() {
  return useOptimisticMutation({
    request: (id: string) => ({
      method: 'DELETE' as const,
      path: api.memos[':id'].$url({ param: { id } }).pathname,
    }),
    keys: WRITE_KEYS,
    apply: (client, id) => applyToTimeline(client, timelineEntryId('memo', id), null),
  });
}
