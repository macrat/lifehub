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
import { useOptimisticMutation } from '../../lib/query-client.ts';

export type CreateCareLogBody = InferRequestType<typeof api.lemon.logs.$post>['json'];
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
  return useOptimisticMutation({
    mutationFn: async (input: CreateCareLogBody) =>
      (await ensureOk(await api.lemon.logs.$post({ json: input }))).json(),
    keys: [LEMON_QUERY_KEY],
    apply: (client, input) => {
      const log: CareLog = {
        id: crypto.randomUUID(),
        careType: input.careType,
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

export function useDeleteCareLog() {
  return useOptimisticMutation({
    mutationFn: async (id: string) => {
      await ensureOk(await api.lemon.logs[':id'].$delete({ param: { id } }));
    },
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
 * 記録 1 件をタイルに映す。記録の一覧が無い画面（ホーム）でもタイルが進むよう、その種別だけを見る。
 * 状態の導き方そのものは shared/lemon.ts に任せる（未来の記録やメモはタイルを動かさない）。
 */
function advanceStatus(statuses: CareStatus[], log: CareLog): CareStatus[] {
  const next = careStatuses([log], new Date()).find((s) => s.careType === log.careType);
  const lastDoneAt = next?.lastDoneAt;
  if (!next || !lastDoneAt) return statuses;
  return statuses.map((status) =>
    status.careType === next.careType && (status.lastDoneAt ?? '') < lastDoneAt ? next : status,
  );
}

/** 記録の一覧が取得済みなら、そこから状態を導き直す（無ければ再取得に任せる） */
function recomputeStatus(client: QueryClient): void {
  const logs = client.getQueryData(lemonLogsQueryOptions.queryKey);
  if (logs) client.setQueryData(lemonStatusQueryOptions.queryKey, careStatuses(logs, new Date()));
}
