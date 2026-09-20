import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { InferRequestType, InferResponseType } from 'hono/client';
import { api, ensureOk } from '../../lib/api.ts';

export type CreateCareLogBody = InferRequestType<typeof api.lemon.logs.$post>['json'];
export type CareLog = InferResponseType<typeof api.lemon.logs.$get, 200>[number];
export type CareStatus = InferResponseType<typeof api.lemon.status.$get, 200>[number];

export const LEMON_QUERY_KEY = ['lemon'] as const;

export const lemonStatusQueryOptions = queryOptions({
  queryKey: [...LEMON_QUERY_KEY, 'status'],
  queryFn: async () => (await ensureOk(await api.lemon.status.$get())).json(),
});

export const lemonLogsQueryOptions = queryOptions({
  queryKey: [...LEMON_QUERY_KEY, 'logs'],
  queryFn: async () => (await ensureOk(await api.lemon.logs.$get())).json(),
});

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: LEMON_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

export function useLogCare() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: CreateCareLogBody) =>
      (await ensureOk(await api.lemon.logs.$post({ json: input }))).json(),
    onSuccess: invalidate,
  });
}

export function useDeleteCareLog() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      await ensureOk(await api.lemon.logs[':id'].$delete({ param: { id } }));
    },
    onSuccess: invalidate,
  });
}
