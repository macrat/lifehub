import { type QueryClient, queryOptions, useQuery } from '@tanstack/react-query';
import {
  BALANCE_NEEDS_TWO_USERS,
  type Balance,
  balanceOf,
  balancePair,
  type Expense,
  type ExpenseTotal,
  sortExpenses,
} from '../../../shared/expenses.ts';
import type { ExpenseFilter, ExpenseInput } from '../../../shared/validation/expenses.ts';
import { api, createRequest, deleteRequest, ensureOk, itemRequest } from '../../lib/api.ts';
import { type HistorySource, useHistory } from '../../lib/history.ts';
import {
  type QueryState,
  useCreateMutation,
  useOptimisticMutation,
} from '../../lib/query-client.ts';
import { TIMELINE_QUERY_KEY, timelineRecordCache } from '../timeline/queries.ts';
import { useUsers } from '../users/queries.ts';

/**
 * 追加と編集で同じ形（編集は全項目を置き換える）。フォームが検証した値（スキーマの出力）で、
 * 送る JSON としてもそのまま使える。日付は印の付いた DateString なので、楽観的更新で作る行の型
 * （`Expense`）と一致する。
 */
export type ExpenseBody = ExpenseInput;
/** 行と残高の形はサーバーと共有する（楽観的更新もこの形で導く。shared/expenses.ts） */
export type { Balance, Expense } from '../../../shared/expenses.ts';

const EXPENSES_QUERY_KEY = ['expenses'] as const;

/** 書き込みが変えるクエリ（立替の履歴・合計と、全機能の記録を並べるタイムライン） */
const WRITE_KEYS = [EXPENSES_QUERY_KEY, TIMELINE_QUERY_KEY];

/**
 * 履歴（`src/lib/history.ts`）。絞り込みはサーバーが掛ける
 * （手元にあるのは読んだページだけなので、手元では絞り込めない）。
 */
const expenseHistory: HistorySource<Expense, ExpenseFilter> = {
  key: [...EXPENSES_QUERY_KEY, 'list'],
  fetch: async (filter, before, signal) => {
    const query = { ...filter, min: filter.min?.toString(), max: filter.max?.toString(), before };
    return (await ensureOk(await api.expenses.$get({ query }, { init: { signal } }))).json();
  },
  dayOf: (expense) => expense.spentOn,
  sort: sortExpenses,
};

/** 履歴とタイムラインへの先回りの読み書き */
const expenseCache = timelineRecordCache('expense', expenseHistory);

/** 立替画面の履歴（`useHistory`） */
export function useExpenseHistory(filter: ExpenseFilter) {
  return useHistory(expenseHistory, filter);
}

/** 残高の元になる「誰が誰のために払ったか」ごとの合計（shared/expenses.ts の `balanceOf` が読む形） */
const totalsQueryOptions = queryOptions({
  queryKey: [...EXPENSES_QUERY_KEY, 'totals'],
  queryFn: async (): Promise<ExpenseTotal[]> =>
    (await ensureOk(await api.expenses.totals.$get())).json(),
});

/**
 * 残高。サーバーの合計とユーザー（登録順の先頭 2 人が A, B。サーバーと同じ）から導く。
 * 立替ページが読む。
 */
export function useBalance(): QueryState<Balance> {
  const totals = useQuery(totalsQueryOptions);
  const users = useUsers();
  const pair = users.data && balancePair(users.data);
  return {
    data: totals.data && pair ? balanceOf(totals.data, pair) : undefined,
    error:
      totals.error ??
      users.error ??
      (users.data && !pair ? new Error(BALANCE_NEEDS_TWO_USERS) : null),
  };
}

export function useAddExpense() {
  return useCreateMutation<ExpenseBody>({
    request: createRequest(api.expenses),
    keys: WRITE_KEYS,
    apply: (client, input) => {
      applyChange(client, input.id, null, { ...input, createdAt: new Date().toISOString() });
    },
  });
}

export function useUpdateExpense() {
  return useOptimisticMutation({
    request: itemRequest<ExpenseBody & { id: string }>('PUT', api.expenses[':id']),
    keys: WRITE_KEYS,
    apply: (client, { id, ...input }) => {
      const prev = expenseCache.find(client, id);
      if (prev) applyChange(client, id, prev, { ...prev, ...input });
    },
  });
}

export function useDeleteExpense() {
  return useOptimisticMutation({
    request: deleteRequest(api.expenses[':id']),
    keys: WRITE_KEYS,
    apply: (client, id) => {
      const prev = expenseCache.find(client, id);
      if (prev) applyChange(client, id, prev, null);
    },
  });
}

/**
 * 1 件の変化（prev → next。追加は prev が null、削除は next が null）を先回りして書き込む。
 * - 合計: prev の分を引き、next の分を足す。残高は合計から導くので、端数を含めてサーバーと一致する
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
