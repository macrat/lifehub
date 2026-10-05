import { type QueryClient, queryOptions } from '@tanstack/react-query';
import {
  type Expense,
  type ExpenseTotal,
  type Settlement,
  settlementsOf,
  sortExpenses,
} from '../../../shared/expenses.ts';
import type { ExpenseFilter, ExpenseInput } from '../../../shared/validation/expenses.ts';
import { api, write } from '../../lib/api.ts';
import type { HistorySource } from '../../lib/history.ts';
import {
  type QueryState,
  useCreateMutation,
  useOptimisticMutation,
} from '../../lib/query-client.ts';
import { useStoreQuery } from '../../lib/screen-data.ts';
import { recordWriteKeys, timelineRecordCache } from '../timeline/queries.ts';

/** 行と精算の形はサーバーと共有する（楽観的更新もこの形で導く。shared/expenses.ts） */
export type { Expense, Settlement } from '../../../shared/expenses.ts';

const EXPENSES_QUERY_KEY = ['expenses'] as const;

/** 書き込みが変えるクエリ（立替の履歴・合計と、全機能の記録を並べるタイムライン） */
const WRITE_KEYS = recordWriteKeys(EXPENSES_QUERY_KEY);

/**
 * 立替画面の履歴（`src/lib/history.ts`。画面は `useScreenHistory` で購読する）。絞り込みはサーバーが掛ける
 * （手元にあるのは読んだページだけなので、手元では絞り込めない）。
 */
export const expenseHistory: HistorySource<Expense, ExpenseFilter> = {
  key: [...EXPENSES_QUERY_KEY, 'list'],
  fetch: (filter, before, signal) => api.expenses.list.query({ ...filter, before }, { signal }),
  dayOf: (expense) => expense.spentOn,
  sort: sortExpenses,
};

/** 履歴とタイムラインへの先回りの読み書き */
const expenseCache = timelineRecordCache('expense', expenseHistory);

/** 精算の元になる「誰が誰のために払ったか」ごとの合計（shared/expenses.ts の `settlementsOf` が読む形） */
export const totalsQueryOptions = queryOptions({
  queryKey: [...EXPENSES_QUERY_KEY, 'totals'],
  queryFn: ({ signal }): Promise<ExpenseTotal[]> =>
    api.expenses.totals.query(undefined, { signal }),
});

/** 立替を帳消しにする資金移動。サーバーの合計から導く（式はサーバーと同じ `settlementsOf`）。立替ページが読む */
export function useSettlements(): QueryState<Settlement[]> {
  const totals = useStoreQuery(totalsQueryOptions);
  return { data: totals.data && settlementsOf(totals.data), error: totals.error };
}

/**
 * 追加と編集は同じ形（`ExpenseInput`。編集は全項目を置き換える）。フォームが検証した値（スキーマの出力）で、
 * 送る JSON としてもそのまま使える。日付は印の付いた DateString なので、楽観的更新で作る行の型
 * （`Expense`）と一致する。
 */
export function useAddExpense() {
  return useCreateMutation<ExpenseInput>({
    request: write.expenses.create,
    keys: WRITE_KEYS,
    apply: (client, input) => {
      applyChange(client, input.id, null, { ...input, createdAt: new Date().toISOString() });
    },
  });
}

export function useUpdateExpense() {
  return useOptimisticMutation<ExpenseInput & { id: string }>({
    request: write.expenses.update,
    keys: WRITE_KEYS,
    apply: (client, { id, ...input }) => {
      const prev = expenseCache.find(client, id);
      if (prev) applyChange(client, id, prev, { ...prev, ...input });
    },
  });
}

export function useDeleteExpense() {
  return useOptimisticMutation({
    request: (id: string) => write.expenses.delete({ id }),
    keys: WRITE_KEYS,
    apply: (client, id) => {
      const prev = expenseCache.find(client, id);
      if (prev) applyChange(client, id, prev, null);
    },
  });
}

/**
 * 1 件の変化（prev → next。追加は prev が null、削除は next が null）を先回りして書き込む。
 * - 合計: prev の分を引き、next の分を足す。精算は合計から導くので、サーバーと一致する
 * - 履歴とタイムライン: `timelineRecordCache` の apply
 */
function applyChange(
  client: QueryClient,
  id: string,
  prev: Expense | null,
  next: Expense | null,
): void {
  client.setQueryData(totalsQueryOptions.queryKey, (totals) => {
    if (!totals) return totals;
    const withoutPrev = prev ? addTotal(totals, prev, -1) : totals;
    return next ? addTotal(withoutPrev, next, 1) : withoutPrev;
  });
  expenseCache.apply(client, id, next);
}

function addTotal(totals: ExpenseTotal[], e: Expense, sign: 1 | -1): ExpenseTotal[] {
  const same = (t: ExpenseTotal) => t.fromUserId === e.fromUserId && t.toUserId === e.toUserId;
  const delta = sign * e.amount;
  return totals.some(same)
    ? totals.map((t) => (same(t) ? { ...t, amount: t.amount + delta } : t))
    : [...totals, { fromUserId: e.fromUserId, toUserId: e.toUserId, amount: delta }];
}
