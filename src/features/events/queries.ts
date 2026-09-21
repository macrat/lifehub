import { queryOptions } from '@tanstack/react-query';
import type { InferRequestType } from 'hono/client';
import { api, ensureOk } from '../../lib/api.ts';
import { useCreateMutation, useOptimisticMutation } from '../../lib/query-client.ts';
import { CALENDAR_QUERY_KEY } from '../calendar/queries.ts';
import { insertItem, removeItem, setCompleted, updateItem } from './optimistic.ts';

const EVENTS_QUERY_KEY = ['events'] as const;

/** API へ送る形（日時は ISO 文字列）。サーバーの Zod スキーマの入力型から導く。 */
export type CreateEventBody = InferRequestType<typeof api.events.$post>['json'];
export type UpdateEventBody = InferRequestType<(typeof api.events)[':id']['$put']>['json'];
export type DeleteEventBody = InferRequestType<(typeof api.events)[':id']['$delete']>['json'];

/** 保存されている行そのもの。繰り返しの「すべて」を編集するときに使う。 */
export function eventQueryOptions(id: string) {
  return queryOptions({
    queryKey: [...EVENTS_QUERY_KEY, id],
    queryFn: async () => {
      const res = await ensureOk(await api.events[':id'].$get({ param: { id } }));
      return res.json();
    },
  });
}

/** 書き込みが変えるクエリ（カレンダーの各期間と、繰り返し元の行） */
const WRITE_KEYS = [CALENDAR_QUERY_KEY, EVENTS_QUERY_KEY];

export function useCreateEvent() {
  return useCreateMutation<CreateEventBody>({
    request: (input) => ({
      method: 'POST' as const,
      path: api.events.$url().pathname,
      body: input,
    }),
    keys: WRITE_KEYS,
    apply: insertItem,
  });
}

export function useUpdateEvent() {
  return useOptimisticMutation({
    request: ({ id, ...input }: UpdateEventBody & { id: string }) => ({
      method: 'PUT' as const,
      path: api.events[':id'].$url({ param: { id } }).pathname,
      body: input,
    }),
    keys: WRITE_KEYS,
    apply: updateItem,
  });
}

export function useDeleteEvent() {
  return useOptimisticMutation({
    request: ({ id, ...input }: DeleteEventBody & { id: string }) => ({
      method: 'DELETE' as const,
      path: api.events[':id'].$url({ param: { id } }).pathname,
      body: input,
    }),
    keys: WRITE_KEYS,
    apply: removeItem,
  });
}

/** タスクの完了・完了取り消し。カレンダー／ホームのカードから直接呼ぶ。繰り返しでは occurrenceStart で回を指定する */
export function useToggleCompletion() {
  return useOptimisticMutation({
    request: ({
      id,
      occurrenceStart,
      completed,
    }: {
      id: string;
      occurrenceStart: string | null;
      completed: boolean;
    }) => ({
      method: completed ? ('POST' as const) : ('DELETE' as const),
      path: api.events[':id'].complete.$url({ param: { id } }).pathname,
      body: { occurrenceStart: occurrenceStart ?? undefined },
    }),
    keys: WRITE_KEYS,
    apply: (client, { id, occurrenceStart, completed }) =>
      setCompleted(
        client,
        { id, scope: 'this', occurrenceStart: occurrenceStart ?? undefined },
        completed,
      ),
  });
}
