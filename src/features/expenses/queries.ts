import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { InferRequestType, InferResponseType } from 'hono/client';
import { api, ensureOk } from '../../lib/api.ts';

export type CreateExpenseBody = InferRequestType<typeof api.expenses.$post>['json'];
export type ExpenseHistory = InferResponseType<typeof api.expenses.$get, 200>;
export type Balance = InferResponseType<typeof api.expenses.balance.$get, 200>;

export const EXPENSES_QUERY_KEY = ['expenses'] as const;

export const expenseHistoryQueryOptions = queryOptions({
  queryKey: [...EXPENSES_QUERY_KEY, 'history'],
  queryFn: async () => (await ensureOk(await api.expenses.$get())).json(),
});

export const balanceQueryOptions = queryOptions({
  queryKey: [...EXPENSES_QUERY_KEY, 'balance'],
  queryFn: async () => (await ensureOk(await api.expenses.balance.$get())).json(),
});

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: EXPENSES_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

export function useAddExpense() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: CreateExpenseBody) =>
      (await ensureOk(await api.expenses.$post({ json: input }))).json(),
    onSuccess: invalidate,
  });
}

export function useDeleteExpense() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      await ensureOk(await api.expenses[':id'].$delete({ param: { id } }));
    },
    onSuccess: invalidate,
  });
}

export function useSettle() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async () => (await ensureOk(await api.expenses.settle.$post())).json(),
    onSuccess: invalidate,
  });
}
