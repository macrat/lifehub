import { type QueryClient, queryOptions } from '@tanstack/react-query';
import {
  type ExpenseSchedule,
  type ExpenseTotal,
  type MoneyBalance,
  type MoneyRecord,
  type Settlement,
  settlementsOf,
  sortBalances,
  sortMoneyRecords,
} from '../../../shared/money.ts';
import type {
  ExpenseInput,
  ExpenseScheduleInput,
  MoneyFilter,
  MoneyRule,
} from '../../../shared/validation/money.ts';
import { api, write } from '../../lib/api.ts';
import type { HistorySource } from '../../lib/history.ts';
import { putById } from '../../lib/list.ts';
import { useCreateMutation, useOptimisticMutation } from '../../lib/mutation.ts';
import { type QueryState, useStoreQuery } from '../../lib/screen-data.ts';
import { recordWriteKeys, timelineRecordCache } from '../timeline/queries.ts';

const MONEY_QUERY_KEY = ['money'] as const;

/**
 * お金の画面の一覧: 立替と取り込んだ入出金を 1 本に並べた履歴（`src/lib/history.ts`。画面は `useScreenHistory` で
 * 購読する）。絞り込みはサーバーが掛ける（手元にあるのは読んだページだけなので、手元では絞り込めない）
 */
export const moneyHistory: HistorySource<MoneyRecord, MoneyFilter> = {
  key: [...MONEY_QUERY_KEY, 'list'],
  fetch: (filter, before, signal) => api.money.list.query({ ...filter, before }, { signal }),
  dayOf: (record) => record.occurredOn,
  sort: sortMoneyRecords,
};

/** 精算の元になる「誰が誰のために払ったか」ごとの合計（shared/money.ts の `settlementsOf` が読む形） */
export const totalsQueryOptions = queryOptions({
  queryKey: [...MONEY_QUERY_KEY, 'totals'],
  queryFn: ({ signal }): Promise<ExpenseTotal[]> => api.money.totals.query(undefined, { signal }),
});

/** 記録の書き込みが変えるクエリ（お金の画面の一覧、精算の元の合計、全機能の記録を並べるタイムライン） */
const WRITE_KEYS = recordWriteKeys(moneyHistory.key, totalsQueryOptions.queryKey);

/** お金の画面の一覧とタイムラインへの、立替 1 件の先回りの読み書き */
const recordCache = timelineRecordCache('expense', moneyHistory);

/** 立替を帳消しにする資金移動。サーバーの合計から導く（式はサーバーと同じ `settlementsOf`）。お金の画面が読む */
export function useSettlements(): QueryState<Settlement[]> {
  const totals = useStoreQuery(totalsQueryOptions);
  return { data: totals.data && settlementsOf(totals.data), error: totals.error };
}

/**
 * お金の画面のカード（口座の残高・評価額とカードの次回の引き落とし）。並びはサーバーの環境変数に書いた順。
 * 画面からは書かない（Money Forward から日に 1 度取り込む）ので、楽観的更新は無い
 */
export const accountsQueryOptions = queryOptions({
  queryKey: [...MONEY_QUERY_KEY, 'accounts'],
  queryFn: ({ signal }) => api.money.accounts.query(undefined, { signal }),
});

/**
 * 口座の値の推移（残高の推移のグラフ）。1 ページは 3 か月で、古いほうはグラフを過去へ動かしたときに読み足す
 * （`useBalanceChart`）。今取り込んでいる口座すべての物を読み、どの口座を出すかは画面が選ぶ（選び直しても読み直さない）
 */
export const balanceHistory: HistorySource<MoneyBalance, Record<string, never>> = {
  key: [...MONEY_QUERY_KEY, 'balances'],
  fetch: (_filter, before, signal) => api.money.balances.query({ before }, { signal }),
  dayOf: (balance) => balance.on,
  sort: sortBalances,
  oldestFirst: true,
};

/**
 * 追加と編集は同じ形（`ExpenseInput`。編集は全項目を置き換える）。フォームが検証した値（スキーマの出力）で、
 * 送る JSON としてもそのまま使える。日付は印の付いた DateString なので、楽観的更新で作る行の型
 * （`MoneyRecord`）と一致する。
 */
export function useAddExpense() {
  return useCreateMutation<ExpenseInput>({
    request: write.money.create,
    keys: WRITE_KEYS,
    apply: (client, input) => {
      applyChange(client, input.id, null, {
        ...input,
        createdAt: new Date().toISOString(),
        account: null,
      });
    },
  });
}

export function useUpdateExpense() {
  return useOptimisticMutation<ExpenseInput & { id: string }>({
    request: write.money.update,
    keys: WRITE_KEYS,
    apply: (client, { id, ...input }) => {
      const prev = recordCache.find(client, id);
      if (prev) applyChange(client, id, prev, { ...prev, ...input });
    },
  });
}

export function useDeleteExpense() {
  return useOptimisticMutation({
    request: (id: string) => write.money.delete({ id }),
    keys: WRITE_KEYS,
    apply: (client, id) => {
      const prev = recordCache.find(client, id);
      if (prev) applyChange(client, id, prev, null);
    },
  });
}

/**
 * 1 件の変化（prev → next。追加は prev が null、削除は next が null）を先回りして書き込む。
 * - 合計: prev の分を引き、next の分を足す。精算は合計から導くので、サーバーと一致する
 * - 一覧とタイムライン: `timelineRecordCache` の apply
 */
function applyChange(
  client: QueryClient,
  id: string,
  prev: MoneyRecord | null,
  next: MoneyRecord | null,
): void {
  client.setQueryData(totalsQueryOptions.queryKey, (totals) => {
    if (!totals) return totals;
    const withoutPrev = prev ? addTotal(totals, prev, -1) : totals;
    return next ? addTotal(withoutPrev, next, 1) : withoutPrev;
  });
  recordCache.apply(client, id, next);
}

/** 手で入れた立替 1 件分を合計に足し引きする（手で入れた立替の金額は正の数） */
function addTotal(totals: ExpenseTotal[], e: MoneyRecord, sign: 1 | -1): ExpenseTotal[] {
  const same = (t: ExpenseTotal) => t.fromUserId === e.fromUserId && t.toUserId === e.toUserId;
  const delta = sign * e.amount;
  return totals.some(same)
    ? totals.map((t) => (same(t) ? { ...t, amount: t.amount + delta } : t))
    : [...totals, { fromUserId: e.fromUserId, toUserId: e.toUserId, amount: delta }];
}

/** 立替スケジュール（作った順）。設定の「立替スケジュール」が読む */
export const expenseSchedulesQueryOptions = queryOptions({
  queryKey: [...MONEY_QUERY_KEY, 'schedules'],
  queryFn: ({ signal }): Promise<ExpenseSchedule[]> =>
    api.money.schedules.query(undefined, { signal }),
});

/** スケジュールの並びに 1 件の変化（id のスケジュールが next になる。削除は null。追加は末尾）を先回りして書く */
function applySchedule(client: QueryClient, id: string, next: ExpenseSchedule | null): void {
  client.setQueryData(
    expenseSchedulesQueryOptions.queryKey,
    (list) => list && putById(list, id, next),
  );
}

/**
 * 立替スケジュールを作る。最初の日が今日までなら、サーバーがその場で立替も記録するので、一覧・精算・タイムラインも取り直す
 * （記録される立替は先回りして書かない。回の日の数え方はサーバーと同じだが、ID はサーバーが決める）
 */
export function useAddExpenseSchedule() {
  return useCreateMutation<ExpenseScheduleInput>({
    request: write.money.createSchedule,
    keys: [...WRITE_KEYS, expenseSchedulesQueryOptions.queryKey],
    apply: (client, schedule) => applySchedule(client, schedule.id, schedule),
  });
}

/** 立替スケジュールを書き換える。まだ記録していない回にだけ効くので、記録した立替は変わらない */
export function useUpdateExpenseSchedule() {
  return useOptimisticMutation<ExpenseScheduleInput & { id: string }>({
    request: write.money.updateSchedule,
    keys: [expenseSchedulesQueryOptions.queryKey],
    apply: (client, schedule) => applySchedule(client, schedule.id, schedule),
  });
}

/** 立替スケジュールを消す。記録した立替は残る */
export function useDeleteExpenseSchedule() {
  return useOptimisticMutation({
    request: (id: string) => write.money.deleteSchedule({ id }),
    keys: [expenseSchedulesQueryOptions.queryKey],
    apply: (client, id) => applySchedule(client, id, null),
  });
}

/** 入出金の読み替えのルール（上から順。設定から開く「取り込みルール」） */
export const rulesQueryOptions = queryOptions({
  queryKey: [...MONEY_QUERY_KEY, 'rules'],
  queryFn: ({ signal }) => api.money.rules.query(undefined, { signal }),
});

/**
 * ルールの並び全体を保存する。サーバーは取り込み済みの入出金を読み替え直すので、一覧・精算の元の合計・
 * タイムラインも取り直す。読み替えの結果は先回りしない（当て直しはサーバーだけが持つ）
 */
export function useSaveRules() {
  return useOptimisticMutation<MoneyRule[]>({
    request: write.money.saveRules,
    keys: [...WRITE_KEYS, rulesQueryOptions.queryKey],
    apply: (client, rules) => {
      client.setQueryData(rulesQueryOptions.queryKey, rules);
    },
  });
}
