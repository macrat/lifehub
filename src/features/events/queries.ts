import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { InferRequestType } from 'hono/client';
import { api, ensureOk } from '../../lib/api.ts';
import { CALENDAR_QUERY_KEY } from '../calendar/queries.ts';

/** API へ送る形（日時は ISO 文字列）。サーバーの Zod スキーマの入力型から導く。 */
export type CreateEventBody = InferRequestType<typeof api.events.$post>['json'];
export type UpdateEventBody = InferRequestType<(typeof api.events)[':id']['$put']>['json'];
export type DeleteEventBody = InferRequestType<(typeof api.events)[':id']['$delete']>['json'];

/** マスター（保存されている予定そのもの）。繰り返しの「すべて」を編集するときに使う。 */
export function eventQueryOptions(id: string) {
  return queryOptions({
    queryKey: ['events', id],
    queryFn: async () => {
      const res = await ensureOk(await api.events[':id'].$get({ param: { id } }));
      return res.json();
    },
  });
}

function useInvalidateCalendar() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: CALENDAR_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ['events'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

export function useCreateEvent() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: async (input: CreateEventBody) => {
      const res = await ensureOk(await api.events.$post({ json: input }));
      return res.json();
    },
    onSuccess: invalidate,
  });
}

export function useUpdateEvent() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateEventBody & { id: string }) => {
      const res = await ensureOk(await api.events[':id'].$put({ param: { id }, json: input }));
      return res.json();
    },
    onSuccess: invalidate,
  });
}

export function useDeleteEvent() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: async ({ id, ...input }: DeleteEventBody & { id: string }) => {
      await ensureOk(await api.events[':id'].$delete({ param: { id }, json: input }));
    },
    onSuccess: invalidate,
  });
}
