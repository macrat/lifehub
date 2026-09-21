import { type QueryClient, queryOptions } from '@tanstack/react-query';
import type { InferRequestType } from 'hono/client';
import {
  type Balance,
  computeBalance,
  type Expense,
  sortExpenses,
} from '../../../shared/expenses.ts';
import { api, ensureOk } from '../../lib/api.ts';
import { useOptimisticMutation } from '../../lib/query-client.ts';
import { usersQueryOptions } from '../users/queries.ts';

export type CreateExpenseBody = InferRequestType<typeof api.expenses.$post>['json'];
/** 行と残高の形はサーバーと共有する（楽観的更新もこの形で導く。shared/expenses.ts） */
export type { Balance, Expense } from '../../../shared/expenses.ts';

const EXPENSES_QUERY_KEY = ['expenses'] as const;

export const expensesQueryOptions = queryOptions({
  queryKey: [...EXPENSES_QUERY_KEY, 'list'],
  queryFn: async (): Promise<Expense[]> => (await ensureOk(await api.expenses.$get())).json(),
});

export const balanceQueryOptions = queryOptions({
  queryKey: [...EXPENSES_QUERY_KEY, 'balance'],
  queryFn: async (): Promise<Balance> => (await ensureOk(await api.expenses.balance.$get())).json(),
});

export function useAddExpense() {
  return useOptimisticMutation({
    mutationFn: async (input: CreateExpenseBody) =>
      (await ensureOk(await api.expenses.$post({ json: input }))).json(),
    keys: [EXPENSES_QUERY_KEY],
    apply: (client, input) => {
      const expense: Expense = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };
      client.setQueryData(
        expensesQueryOptions.queryKey,
        (expenses) => expenses && sortExpenses([expense, ...expenses]),
      );
      recomputeBalance(client);
    },
  });
}

export function useDeleteExpense() {
  return useOptimisticMutation({
    mutationFn: async (id: string) => {
      await ensureOk(await api.expenses[':id'].$delete({ param: { id } }));
    },
    keys: [EXPENSES_QUERY_KEY],
    apply: (client, id) => {
      client.setQueryData(expensesQueryOptions.queryKey, (expenses) =>
        expenses?.filter((expense) => expense.id !== id),
      );
      recomputeBalance(client);
    },
  });
}

/**
 * 残高を一覧から導き直す（式は shared/expenses.ts）。
 * 一覧かユーザー（2 人）が未取得なら何もしない（再取得でサーバーの値が入る）。
 */
function recomputeBalance(client: QueryClient): void {
  const expenses = client.getQueryData(expensesQueryOptions.queryKey);
  const users = client.getQueryData(usersQueryOptions.queryKey);
  const [a, b] = users ?? [];
  if (!expenses || !a || !b || users?.length !== 2) return;
  client.setQueryData(balanceQueryOptions.queryKey, computeBalance(expenses, [a.id, b.id]));
}
