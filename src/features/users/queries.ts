import { queryOptions } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import { pickDistinctHue } from '../../../shared/color.ts';
import type { CreateUserInput, UpdateUserInput } from '../../../shared/validation/users.ts';
import { api, ensureOk } from '../../lib/api.ts';
import { meQueryOptions } from '../../lib/auth.ts';
import { useOptimisticMutation } from '../../lib/query-client.ts';

export type User = InferResponseType<typeof api.users.$get>[number];

export const usersQueryOptions = queryOptions({
  queryKey: ['users'],
  queryFn: async () => {
    const res = await ensureOk(await api.users.$get());
    return res.json();
  },
});

export function useCreateUser() {
  return useOptimisticMutation({
    mutationFn: async (input: CreateUserInput) => {
      const res = await ensureOk(await api.users.$post({ json: input }));
      return res.json();
    },
    keys: [usersQueryOptions.queryKey],
    apply: (client, input) => {
      client.setQueryData(usersQueryOptions.queryKey, (users) => {
        if (!users) return users;
        // 色の既定はサーバーと同じ規則（既存のユーザーから最も離れた色相）で決める
        const hue = input.hue ?? pickDistinctHue(users.map((user) => user.hue));
        return [...users, { id: crypto.randomUUID(), name: input.name, email: input.email, hue }];
      });
    },
  });
}

export function useUpdateUser() {
  return useOptimisticMutation({
    mutationFn: async ({ id, ...input }: UpdateUserInput & { id: string }) => {
      const res = await ensureOk(await api.users[':id'].$patch({ param: { id }, json: input }));
      return res.json();
    },
    keys: [usersQueryOptions.queryKey, meQueryOptions.queryKey],
    apply: (client, { id, name, hue }) => {
      // パスワードは表示に関わらないので、名前と色だけを当てる
      const changes = {
        ...(name === undefined ? {} : { name }),
        ...(hue === undefined ? {} : { hue }),
      };
      client.setQueryData(usersQueryOptions.queryKey, (users) =>
        users?.map((user) => (user.id === id ? { ...user, ...changes } : user)),
      );
      client.setQueryData(meQueryOptions.queryKey, (me) =>
        me && me.id === id ? { ...me, ...changes } : me,
      );
    },
  });
}
