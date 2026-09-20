import { queryOptions, useMutation } from '@tanstack/react-query';
import type { InferRequestType, InferResponseType } from 'hono/client';
import { api, ensureOk } from '../../lib/api.ts';
import { useInvalidate } from '../../lib/query-client.ts';

export type CreateExpenseBody = InferRequestType<typeof api.expenses.$post>['json'];
export type Expense = InferResponseType<typeof api.expenses.$get, 200>[number];
export type Balance = InferResponseType<typeof api.expenses.balance.$get, 200>;

const EXPENSES_QUERY_KEY = ['expenses'] as const;

export const expensesQueryOptions = queryOptions({
  queryKey: [...EXPENSES_QUERY_KEY, 'list'],
  queryFn: async () => (await ensureOk(await api.expenses.$get())).json(),
});

export const balanceQueryOptions = queryOptions({
  queryKey: [...EXPENSES_QUERY_KEY, 'balance'],
  queryFn: async () => (await ensureOk(await api.expenses.balance.$get())).json(),
});

/** 書き込み後に無効化するクエリ */
const useInvalidateAfterWrite = () => useInvalidate(EXPENSES_QUERY_KEY);

export function useAddExpense() {
  const invalidate = useInvalidateAfterWrite();
  return useMutation({
    mutationFn: async (input: CreateExpenseBody) =>
      (await ensureOk(await api.expenses.$post({ json: input }))).json(),
    onSuccess: invalidate,
  });
}

export function useDeleteExpense() {
  const invalidate = useInvalidateAfterWrite();
  return useMutation({
    mutationFn: async (id: string) => {
      await ensureOk(await api.expenses[':id'].$delete({ param: { id } }));
    },
    onSuccess: invalidate,
  });
}
