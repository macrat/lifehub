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

/** 追加と編集で同じ形（編集は全項目を置き換える） */
export type ExpenseBody = InferRequestType<typeof api.expenses.$post>['json'];
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
    mutationFn: async (input: ExpenseBody) =>
      (await ensureOk(await api.expenses.$post({ json: input }))).json(),
    keys: [EXPENSES_QUERY_KEY],
    apply: (client, input) => {
      const expense: Expense = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };
      updateList(client, (expenses) => sortExpenses([expense, ...expenses]));
    },
  });
}

export function useUpdateExpense() {
  return useOptimisticMutation({
    mutationFn: async ({ id, ...input }: ExpenseBody & { id: string }) =>
      (await ensureOk(await api.expenses[':id'].$put({ param: { id }, json: input }))).json(),
    keys: [EXPENSES_QUERY_KEY],
    apply: (client, { id, ...input }) => {
      updateList(client, (expenses) =>
        sortExpenses(
          expenses.map((expense) => (expense.id === id ? { ...expense, ...input } : expense)),
        ),
      );
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
      updateList(client, (expenses) => expenses.filter((expense) => expense.id !== id));
    },
  });
}

/**
 * 履歴を書き換え、残高を導き直す（式は shared/expenses.ts）。
 * 履歴が未取得なら何もせず、ユーザー（2 人）が未取得なら残高だけ触らない（再取得でサーバーの値が入る）。
 */
function updateList(client: QueryClient, update: (expenses: Expense[]) => Expense[]): void {
  const expenses = client.getQueryData(expensesQueryOptions.queryKey);
  if (!expenses) return;
  const next = update(expenses);
  client.setQueryData(expensesQueryOptions.queryKey, next);

  const users = client.getQueryData(usersQueryOptions.queryKey);
  const [a, b] = users ?? [];
  if (!a || !b || users?.length !== 2) return;
  client.setQueryData(balanceQueryOptions.queryKey, computeBalance(next, [a.id, b.id]));
}
