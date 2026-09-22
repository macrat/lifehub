import { type QueryClient, queryOptions } from '@tanstack/react-query';
import type { InferRequestType } from 'hono/client';
import {
  type CareLog,
  type CareStatus,
  careStatuses,
  sortCareLogs,
} from '../../../shared/lemon.ts';
import { api, ensureOk } from '../../lib/api.ts';
import { meQueryOptions } from '../../lib/auth.ts';
import { useCreateMutation, useOptimisticMutation } from '../../lib/query-client.ts';

/** 追加と編集で同じ形（編集は全項目を置き換える） */
export type CareLogBody = InferRequestType<typeof api.lemon.logs.$post>['json'];
/** 記録と状態の形はサーバーと共有する（楽観的更新もこの形で導く。shared/lemon.ts） */
export type { CareLog, CareStatus } from '../../../shared/lemon.ts';

const LEMON_QUERY_KEY = ['lemon'] as const;

export const lemonStatusQueryOptions = queryOptions({
  queryKey: [...LEMON_QUERY_KEY, 'status'],
  queryFn: async (): Promise<CareStatus[]> =>
    (await ensureOk(await api.lemon.status.$get())).json(),
});

export const lemonLogsQueryOptions = queryOptions({
  queryKey: [...LEMON_QUERY_KEY, 'logs'],
  queryFn: async (): Promise<CareLog[]> => (await ensureOk(await api.lemon.logs.$get())).json(),
});

export function useLogCare() {
  return useCreateMutation<CareLogBody>({
    request: (input) => ({
      method: 'POST' as const,
      path: api.lemon.logs.$url().pathname,
      body: input,
    }),
    keys: [LEMON_QUERY_KEY],
    apply: (client, input) => {
      const log: CareLog = {
        id: input.id,
        careTypes: input.careTypes,
        doneAt: input.doneAt,
        note: input.note ?? null,
        createdBy: client.getQueryData(meQueryOptions.queryKey)?.id ?? '',
      };
      client.setQueryData(
        lemonLogsQueryOptions.queryKey,
        (logs) => logs && sortCareLogs([log, ...logs]),
      );
      client.setQueryData(
        lemonStatusQueryOptions.queryKey,
        (statuses) => statuses && advanceStatus(statuses, log),
      );
    },
  });
}

export function useUpdateCareLog() {
  return useOptimisticMutation({
    request: ({ id, ...input }: CareLogBody & { id: string }) => ({
      method: 'PUT' as const,
      path: api.lemon.logs[':id'].$url({ param: { id } }).pathname,
      body: input,
    }),
    keys: [LEMON_QUERY_KEY],
    apply: (client, { id, ...input }) => {
      client.setQueryData(
        lemonLogsQueryOptions.queryKey,
        (logs) =>
          logs &&
          sortCareLogs(
            logs.map((log) =>
              log.id === id ? { ...log, ...input, note: input.note ?? null } : log,
            ),
          ),
      );
      // 日時も項目も変えられるので、タイルを 1 つずつ進めるのではなく記録から導き直す
      recomputeStatus(client);
    },
  });
}

export function useDeleteCareLog() {
  return useOptimisticMutation({
    request: (id: string) => ({
      method: 'DELETE' as const,
      path: api.lemon.logs[':id'].$url({ param: { id } }).pathname,
    }),
    keys: [LEMON_QUERY_KEY],
    apply: (client, id) => {
      client.setQueryData(lemonLogsQueryOptions.queryKey, (logs) =>
        logs?.filter((log) => log.id !== id),
      );
      recomputeStatus(client);
    },
  });
}

/**
 * 記録 1 件をタイルに映す。記録の一覧が無い画面（ホーム）でもタイルが進むよう、その 1 件だけを見る。
 * 1 件が複数の項目を持つので、進むタイルも複数になる。
 * 状態の導き方そのものは shared/lemon.ts に任せる（未来の記録や項目の無い記録はタイルを動かさない）。
 */
function advanceStatus(statuses: CareStatus[], log: CareLog): CareStatus[] {
  const advanced = careStatuses([log], new Date());
  return statuses.map((status) => {
    const next = advanced.find((s) => s.careType === status.careType);
    return next?.lastDoneAt && (status.lastDoneAt ?? '') < next.lastDoneAt ? next : status;
  });
}

/** 記録の一覧が取得済みなら、そこから状態を導き直す（無ければ再取得に任せる） */
function recomputeStatus(client: QueryClient): void {
  const logs = client.getQueryData(lemonLogsQueryOptions.queryKey);
  if (logs) client.setQueryData(lemonStatusQueryOptions.queryKey, careStatuses(logs, new Date()));
}
