import { queryOptions, useMutation } from '@tanstack/react-query';
import type { InferRequestType, InferResponseType } from 'hono/client';
import { api, ensureOk } from '../../lib/api.ts';
import { useInvalidate } from '../../lib/query-client.ts';
import { DASHBOARD_QUERY_KEY } from '../dashboard/queries.ts';

export type CreateCareLogBody = InferRequestType<typeof api.lemon.logs.$post>['json'];
export type CareStatus = InferResponseType<typeof api.lemon.status.$get, 200>[number];

const LEMON_QUERY_KEY = ['lemon'] as const;

export const lemonStatusQueryOptions = queryOptions({
  queryKey: [...LEMON_QUERY_KEY, 'status'],
  queryFn: async () => (await ensureOk(await api.lemon.status.$get())).json(),
});

export const lemonLogsQueryOptions = queryOptions({
  queryKey: [...LEMON_QUERY_KEY, 'logs'],
  queryFn: async () => (await ensureOk(await api.lemon.logs.$get())).json(),
});

/** 書き込み後に無効化するクエリ */
const useInvalidateAfterWrite = () => useInvalidate(LEMON_QUERY_KEY, DASHBOARD_QUERY_KEY);

export function useLogCare() {
  const invalidate = useInvalidateAfterWrite();
  return useMutation({
    mutationFn: async (input: CreateCareLogBody) =>
      (await ensureOk(await api.lemon.logs.$post({ json: input }))).json(),
    onSuccess: invalidate,
  });
}

export function useDeleteCareLog() {
  const invalidate = useInvalidateAfterWrite();
  return useMutation({
    mutationFn: async (id: string) => {
      await ensureOk(await api.lemon.logs[':id'].$delete({ param: { id } }));
    },
    onSuccess: invalidate,
  });
}
