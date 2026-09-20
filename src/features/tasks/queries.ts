import { queryOptions, useMutation } from '@tanstack/react-query';
import type { InferRequestType } from 'hono/client';
import { api, ensureOk } from '../../lib/api.ts';
import { useInvalidate } from '../../lib/query-client.ts';
import { CALENDAR_QUERY_KEY } from '../calendar/queries.ts';
import { DASHBOARD_QUERY_KEY } from '../dashboard/queries.ts';

const TASKS_QUERY_KEY = ['tasks'] as const;

export type CreateTaskBody = InferRequestType<typeof api.tasks.$post>['json'];
export type UpdateTaskBody = InferRequestType<(typeof api.tasks)[':id']['$put']>['json'];
export type DeleteTaskBody = InferRequestType<(typeof api.tasks)[':id']['$delete']>['json'];

export function taskQueryOptions(id: string) {
  return queryOptions({
    queryKey: [...TASKS_QUERY_KEY, id],
    queryFn: async () => {
      const res = await ensureOk(await api.tasks[':id'].$get({ param: { id } }));
      return res.json();
    },
  });
}

/** 書き込み後に無効化するクエリ */
const useInvalidateAfterWrite = () =>
  useInvalidate(CALENDAR_QUERY_KEY, TASKS_QUERY_KEY, DASHBOARD_QUERY_KEY);

export function useCreateTask() {
  const invalidate = useInvalidateAfterWrite();
  return useMutation({
    mutationFn: async (input: CreateTaskBody) => {
      const res = await ensureOk(await api.tasks.$post({ json: input }));
      return res.json();
    },
    onSuccess: invalidate,
  });
}

export function useUpdateTask() {
  const invalidate = useInvalidateAfterWrite();
  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateTaskBody & { id: string }) => {
      const res = await ensureOk(await api.tasks[':id'].$put({ param: { id }, json: input }));
      return res.json();
    },
    onSuccess: invalidate,
  });
}

export function useDeleteTask() {
  const invalidate = useInvalidateAfterWrite();
  return useMutation({
    mutationFn: async ({ id, ...input }: DeleteTaskBody & { id: string }) => {
      await ensureOk(await api.tasks[':id'].$delete({ param: { id }, json: input }));
    },
    onSuccess: invalidate,
  });
}

/** 完了・完了取り消し。カレンダー／ホームのカードから直接呼ぶ。 */
export function useToggleTaskCompletion() {
  const invalidate = useInvalidateAfterWrite();
  return useMutation({
    mutationFn: async ({
      id,
      occurrenceKey,
      completed,
    }: {
      id: string;
      occurrenceKey: string;
      completed: boolean;
    }) => {
      const args = { param: { id }, json: { occurrenceKey } };
      if (completed) {
        await ensureOk(await api.tasks[':id'].complete.$post(args));
      } else {
        await ensureOk(await api.tasks[':id'].complete.$delete(args));
      }
    },
    onSuccess: invalidate,
  });
}
