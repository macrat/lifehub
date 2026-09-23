import { type QueryClient, queryOptions } from '@tanstack/react-query';
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
import { meQueryOptions } from '../../lib/auth.ts';
import {
  applyToHistories,
  findInHistories,
  type HistoryPages,
  historyQueryOptions,
  isFiltered,
  useHistory,
} from '../../lib/history.ts';
import { useCreateMutation, useOptimisticMutation } from '../../lib/query-client.ts';

/** 追加と編集で同じ形（編集は全項目を置き換える） */
export type CareLogBody = InferRequestType<typeof api.lemon.logs.$post>['json'];
/** 記録と状態の形はサーバーと共有する（楽観的更新もこの形で導く。shared/lemon.ts） */
export type { CareLog, CareStatus } from '../../../shared/lemon.ts';

const LEMON_QUERY_KEY = ['lemon'] as const;
const LOGS_QUERY_KEY = [...LEMON_QUERY_KEY, 'logs'] as const;

export const lemonStatusQueryOptions = queryOptions({
  queryKey: [...LEMON_QUERY_KEY, 'status'],
  queryFn: async (): Promise<CareStatus[]> =>
    (await ensureOk(await api.lemon.status.$get())).json(),
});

/**
 * 記録（絞り込みごと。`src/lib/history.ts`）。絞り込みはサーバーが掛ける
 * （手元にあるのは読んだページだけなので、手元では絞り込めない）。
 */
function careLogsQueryOptions(filter: CareLogFilter) {
  return historyQueryOptions({
    queryKey: [...LOGS_QUERY_KEY, filter],
    filtered: isFiltered(filter),
    queryFn: async ({ pageParam }) =>
      (
        await ensureOk(await api.lemon.logs.$get({ query: { ...filter, before: pageParam } }))
      ).json(),
  });
}

/** 絞り込みの無い記録。追加・編集はこれにだけ先回りして書き込み、タイルもこれから導き直す */
const UNFILTERED = careLogsQueryOptions({}).queryKey;

/** レモン画面の記録（`useHistory`） */
export function useCareLogHistory(filter: CareLogFilter) {
  return useHistory(careLogsQueryOptions(filter));
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
        createdBy: client.getQueryData(meQueryOptions.queryKey)?.id ?? '',
      };
      applyToLogs(client, input.id, log);
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
      const prev = findInHistories<CareLog>(client, LOGS_QUERY_KEY, id);
      if (!prev) return;
      applyToLogs(client, id, { ...prev, ...input, note: input.note ?? null });
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
      applyToLogs(client, id, null);
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

/** 記録 1 件の変化を読んだ記録に先回りして書き込む（`applyToHistories`。追加・編集は next、削除は null） */
function applyToLogs(client: QueryClient, id: string, next: CareLog | null): void {
  applyToHistories(
    client,
    { queryKey: LOGS_QUERY_KEY, unfilteredKey: UNFILTERED },
    id,
    next && { item: next, day: toDateString(new Date(next.doneAt)), sort: sortCareLogs },
  );
}

/**
 * 絞り込みの無い記録を読んでいれば、そこからタイルを導き直す（無ければ再取得に任せる）。
 * 読んだページは新しいほうから途切れずに続くので、そこに記録がある項目の最新は本当の最新になる。
 * そこに記録が無い項目は、もっと古い（まだ読んでいない）記録が最新かもしれないので、
 * 全部読み終えているとき（未実施と分かる）を除いて今の表示のまま再取得を待つ。
 */
function recomputeStatus(client: QueryClient): void {
  const data = client.getQueryData<HistoryPages<CareLog>>(UNFILTERED);
  if (!data) return;
  const computed = careStatuses(
    data.pages.flatMap((page) => page.items),
    new Date(),
  );
  const complete = data.pages.at(-1)?.nextCursor === null;
  client.setQueryData(lemonStatusQueryOptions.queryKey, (statuses) =>
    statuses?.map((status) => {
      const next = computed.find((s) => s.careType === status.careType);
      return next && (next.lastDoneAt !== null || complete) ? next : status;
    }),
  );
}
