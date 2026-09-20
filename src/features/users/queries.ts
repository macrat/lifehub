import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import type { CreateUserInput, UpdateUserInput } from '../../../shared/validation/users.ts';
import { api, ensureOk } from '../../lib/api.ts';

export type User = InferResponseType<typeof api.users.$get>[number];

export const usersQueryOptions = queryOptions({
  queryKey: ['users'],
  queryFn: async () => {
    const res = await ensureOk(await api.users.$get());
    return res.json();
  },
});

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateUserInput) => {
      const res = await ensureOk(await api.users.$post({ json: input }));
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersQueryOptions.queryKey }),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateUserInput & { id: string }) => {
      const res = await ensureOk(await api.users[':id'].$patch({ param: { id }, json: input }));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usersQueryOptions.queryKey });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
}
