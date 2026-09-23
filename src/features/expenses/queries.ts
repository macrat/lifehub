import { type QueryClient, queryOptions, useQuery } from '@tanstack/react-query';
import type { InferRequestType } from 'hono/client';
import {
  BALANCE_NEEDS_TWO_USERS,
  type Balance,
  balanceOf,
  balancePair,
  type Expense,
  type ExpenseTotal,
  sortExpenses,
} from '../../../shared/expenses.ts';
import type { ExpenseFilter } from '../../../shared/validation/expenses.ts';
import { api, ensureOk } from '../../lib/api.ts';
import {
  applyToHistories,
  findInHistories,
  historyQueryOptions,
  isFiltered,
  useHistory,
} from '../../lib/history.ts';
import {
  type QueryState,
  useCreateMutation,
  useOptimisticMutation,
} from '../../lib/query-client.ts';
import { usersQueryOptions } from '../users/queries.ts';

/** 追加と編集で同じ形（編集は全項目を置き換える） */
export type ExpenseBody = InferRequestType<typeof api.expenses.$post>['json'];
/** 行と残高の形はサーバーと共有する（楽観的更新もこの形で導く。shared/expenses.ts） */
export type { Balance, Expense } from '../../../shared/expenses.ts';

const EXPENSES_QUERY_KEY = ['expenses'] as const;
const LIST_QUERY_KEY = [...EXPENSES_QUERY_KEY, 'list'] as const;

/**
 * 履歴（絞り込みごと。`src/lib/history.ts`）。絞り込みはサーバーが掛ける
 * （手元にあるのは読んだページだけなので、手元では絞り込めない）。
 */
function expensesQueryOptions(filter: ExpenseFilter) {
  return historyQueryOptions({
    queryKey: [...LIST_QUERY_KEY, filter],
    filtered: isFiltered(filter),
    queryFn: async ({ pageParam }) => {
      const query = {
        ...filter,
        min: filter.min?.toString(),
        max: filter.max?.toString(),
        before: pageParam,
      };
      return (await ensureOk(await api.expenses.$get({ query }))).json();
    },
  });
}

/** 立替画面の履歴（`useHistory`） */
export function useExpenseHistory(filter: ExpenseFilter) {
  return useHistory(expensesQueryOptions(filter));
}

/** 絞り込みの無い履歴。追加・編集はこれにだけ先回りして書き込む（`applyChange`） */
const UNFILTERED: ExpenseFilter = {};

/** 残高の元になる「誰が誰のために払ったか」ごとの合計（shared/expenses.ts の `balanceOf` が読む形） */
const totalsQueryOptions = queryOptions({
  queryKey: [...EXPENSES_QUERY_KEY, 'totals'],
  queryFn: async (): Promise<ExpenseTotal[]> =>
    (await ensureOk(await api.expenses.totals.$get())).json(),
});

/**
 * 残高。サーバーの合計とユーザー（登録順の先頭 2 人が A, B。サーバーと同じ）から導く。
 * 立替ページとホームのカードが読む。
 */
export function useBalance(): QueryState<Balance> {
  const totals = useQuery(totalsQueryOptions);
  const users = useQuery(usersQueryOptions);
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
    request: (input) => ({
      method: 'POST' as const,
      path: api.expenses.$url().pathname,
      body: input,
    }),
    keys: [EXPENSES_QUERY_KEY],
    apply: (client, input) => {
      applyChange(client, input.id, null, { ...input, createdAt: new Date().toISOString() });
    },
  });
}

export function useUpdateExpense() {
  return useOptimisticMutation({
    request: ({ id, ...input }: ExpenseBody & { id: string }) => ({
      method: 'PUT' as const,
      path: api.expenses[':id'].$url({ param: { id } }).pathname,
      body: input,
    }),
    keys: [EXPENSES_QUERY_KEY],
    apply: (client, { id, ...input }) => {
      const prev = findInHistories<Expense>(client, LIST_QUERY_KEY, id);
      if (prev) applyChange(client, id, prev, { ...prev, ...input });
    },
  });
}

export function useDeleteExpense() {
  return useOptimisticMutation({
    request: (id: string) => ({
      method: 'DELETE' as const,
      path: api.expenses[':id'].$url({ param: { id } }).pathname,
    }),
    keys: [EXPENSES_QUERY_KEY],
    apply: (client, id) => {
      const prev = findInHistories<Expense>(client, LIST_QUERY_KEY, id);
      if (prev) applyChange(client, id, prev, null);
    },
  });
}

/**
 * 1 件の変化（prev → next。追加は prev が null、削除は next が null）を先回りして書き込む。
 * - 合計: prev の分を引き、next の分を足す。残高は合計から導くので、端数を含めてサーバーと一致する
 * - 履歴: `applyToHistories`（消した物はどの履歴からも除き、足した物は絞り込みの無い履歴にだけ入れる）
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
  applyToHistories(
    client,
    { queryKey: LIST_QUERY_KEY, unfilteredKey: expensesQueryOptions(UNFILTERED).queryKey },
    id,
    next && { item: next, day: next.spentOn, sort: sortExpenses },
  );
}

function addTotal(totals: ExpenseTotal[], e: Expense, sign: 1 | -1): ExpenseTotal[] {
  const same = (t: ExpenseTotal) => t.fromUserId === e.fromUserId && t.toUserId === e.toUserId;
  const delta = sign * e.amount;
  return totals.some(same)
    ? totals.map((t) => (same(t) ? { ...t, amount: t.amount + delta } : t))
    : [...totals, { fromUserId: e.fromUserId, toUserId: e.toUserId, amount: delta }];
}
