import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { InferRequestType, InferResponseType } from 'hono/client';
import { api, ensureOk } from '../../lib/api.ts';
import { CALENDAR_QUERY_KEY } from '../calendar/queries.ts';

export type CreateTaskBody = InferRequestType<typeof api.tasks.$post>['json'];
export type UpdateTaskBody = InferRequestType<(typeof api.tasks)[':id']['$put']>['json'];
export type DeleteTaskBody = InferRequestType<(typeof api.tasks)[':id']['$delete']>['json'];
export type TaskMaster = InferResponseType<(typeof api.tasks)[':id']['$get'], 200>;

export function taskQueryOptions(id: string) {
  return queryOptions({
    queryKey: ['tasks', id],
    queryFn: async () => {
      const res = await ensureOk(await api.tasks[':id'].$get({ param: { id } }));
      return res.json();
    },
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: CALENDAR_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

export function useCreateTask() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: CreateTaskBody) => {
      const res = await ensureOk(await api.tasks.$post({ json: input }));
      return res.json();
    },
    onSuccess: invalidate,
  });
}

export function useUpdateTask() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateTaskBody & { id: string }) => {
      const res = await ensureOk(await api.tasks[':id'].$put({ param: { id }, json: input }));
      return res.json();
    },
    onSuccess: invalidate,
  });
}

export function useDeleteTask() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, ...input }: DeleteTaskBody & { id: string }) => {
      await ensureOk(await api.tasks[':id'].$delete({ param: { id }, json: input }));
    },
    onSuccess: invalidate,
  });
}

/** 完了・完了取り消し。カレンダー／ホームのカードから直接呼ぶ。 */
export function useToggleTaskCompletion() {
  const invalidate = useInvalidate();
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
