import { queryOptions } from '@tanstack/react-query';
import type { InferRequestType } from 'hono/client';
import { toDateString } from '../../../shared/date.ts';
import {
  type CareLog,
  type CareStatus,
  careStatuses,
  sortCareLogs,
} from '../../../shared/lemon.ts';
import type { CareLogFilter } from '../../../shared/validation/lemon.ts';
import { api, ensureOk } from '../../lib/api.ts';
import {
  applyToHistories,
  findInHistories,
  type HistorySource,
  useHistory,
} from '../../lib/history.ts';
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

/**
 * 記録（`src/lib/history.ts`）。絞り込みはサーバーが掛ける
 * （手元にあるのは読んだページだけなので、手元では絞り込めない）。
 */
const careLogHistory: HistorySource<CareLog, CareLogFilter> = {
  key: [...LEMON_QUERY_KEY, 'logs'],
  fetch: async (filter, before, signal) =>
    (
      await ensureOk(
        await api.lemon.logs.$get({ query: { ...filter, before } }, { init: { signal } }),
      )
    ).json(),
  dayOf: (log) => toDateString(new Date(log.doneAt)),
  sort: sortCareLogs,
};

/** レモン画面の記録（`useHistory`） */
export function useCareLogHistory(filter: CareLogFilter) {
  return useHistory(careLogHistory, filter);
}

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
      };
      applyToHistories(client, careLogHistory, input.id, log);
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
      const prev = findInHistories(client, careLogHistory, id);
      if (!prev) return;
      const log = { ...prev, ...input, note: input.note ?? null };
      applyToHistories(client, careLogHistory, id, log);
      // 新しくなった日時で進むタイルだけを進める。項目を外したり日時を戻したりしたときに
      // どこまで戻るかは、読んでいない記録を含めて決まるので書き込み後の取り直しに任せる
      client.setQueryData(
        lemonStatusQueryOptions.queryKey,
        (statuses) => statuses && advanceStatus(statuses, log),
      );
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
      applyToHistories(client, careLogHistory, id, null);
      // タイルがどこまで戻るかは読んでいない記録を含めて決まるので、書き込み後の取り直しに任せる
    },
  });
}

/**
 * 記録 1 件をタイルに映す（進むときだけ）。記録の一覧が無い画面（ホーム）でもタイルが進むよう、その 1 件だけを見る。
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
