import { queryOptions, useMutation } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import type { CreateUserInput, UpdateUserInput } from '../../../shared/validation/users.ts';
import { api, ensureOk } from '../../lib/api.ts';
import { meQueryOptions } from '../../lib/auth.ts';
import { useInvalidate } from '../../lib/query-client.ts';

export type User = InferResponseType<typeof api.users.$get>[number];

export const usersQueryOptions = queryOptions({
  queryKey: ['users'],
  queryFn: async () => {
    const res = await ensureOk(await api.users.$get());
    return res.json();
  },
});

export function useCreateUser() {
  const invalidate = useInvalidate(usersQueryOptions.queryKey);
  return useMutation({
    mutationFn: async (input: CreateUserInput) => {
      const res = await ensureOk(await api.users.$post({ json: input }));
      return res.json();
    },
    onSuccess: invalidate,
  });
}

export function useUpdateUser() {
  const invalidate = useInvalidate(usersQueryOptions.queryKey, meQueryOptions.queryKey);
  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateUserInput & { id: string }) => {
      const res = await ensureOk(await api.users[':id'].$patch({ param: { id }, json: input }));
      return res.json();
    },
    onSuccess: invalidate,
  });
}
