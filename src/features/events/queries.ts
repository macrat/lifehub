import { queryOptions, useMutation } from '@tanstack/react-query';
import type { InferRequestType } from 'hono/client';
import { api, ensureOk } from '../../lib/api.ts';
import { useInvalidate } from '../../lib/query-client.ts';
import { CALENDAR_QUERY_KEY } from '../calendar/queries.ts';

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

/** 書き込み後に無効化するクエリ */
const useInvalidateAfterWrite = () => useInvalidate(CALENDAR_QUERY_KEY, EVENTS_QUERY_KEY);

export function useCreateEvent() {
  const invalidate = useInvalidateAfterWrite();
  return useMutation({
    mutationFn: async (input: CreateEventBody) => {
      const res = await ensureOk(await api.events.$post({ json: input }));
      return res.json();
    },
    onSuccess: invalidate,
  });
}

export function useUpdateEvent() {
  const invalidate = useInvalidateAfterWrite();
  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateEventBody & { id: string }) => {
      const res = await ensureOk(await api.events[':id'].$put({ param: { id }, json: input }));
      return res.json();
    },
    onSuccess: invalidate,
  });
}

export function useDeleteEvent() {
  const invalidate = useInvalidateAfterWrite();
  return useMutation({
    mutationFn: async ({ id, ...input }: DeleteEventBody & { id: string }) => {
      await ensureOk(await api.events[':id'].$delete({ param: { id }, json: input }));
    },
    onSuccess: invalidate,
  });
}

/** タスクの完了・完了取り消し。カレンダー／ホームのカードから直接呼ぶ。繰り返しでは occurrenceStart で回を指定する */
export function useToggleCompletion() {
  const invalidate = useInvalidateAfterWrite();
  return useMutation({
    mutationFn: async ({
      id,
      occurrenceStart,
      completed,
    }: {
      id: string;
      occurrenceStart: string | null;
      completed: boolean;
    }) => {
      const args = { param: { id }, json: { occurrenceStart: occurrenceStart ?? undefined } };
      if (completed) {
        await ensureOk(await api.events[':id'].complete.$post(args));
      } else {
        await ensureOk(await api.events[':id'].complete.$delete(args));
      }
    },
    onSuccess: invalidate,
  });
}
