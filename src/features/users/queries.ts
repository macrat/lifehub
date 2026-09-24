import { queryOptions } from '@tanstack/react-query';
import { pickDistinctHue } from '../../../shared/color.ts';
import type { CreateUserInput, UpdateUserInput } from '../../../shared/validation/users.ts';
import { api } from '../../lib/api.ts';
import { type Me, meQueryOptions } from '../../lib/auth.ts';
import { useOptimisticMutation } from '../../lib/query-client.ts';

export type User = Me['users'][number];

const NO_USERS: User[] = [];

/**
 * ユーザーの一覧。ログイン中のユーザーと一緒に `/api/me` に載ってくるので、そのキャッシュから読む
 * （取り直しの間隔も `meQueryOptions` に従う）。
 * WHY: 名前と色を出す所（`use-user-labels.ts` など）は本人と一覧を必ず一緒に読むので、
 * 別々に問い合わせると 2 本になる。
 */
export const usersQueryOptions = queryOptions({
  ...meQueryOptions,
  select: (me: Me | null): User[] => me?.users ?? NO_USERS,
});

/**
 * ユーザーの登録。オフラインでは溜めずにその場で失敗させる（queue: false）。
 * パスワードを含むので端末に残したくなく、2 人しか居ないアプリで急ぐ操作でもない。
 */
export function useCreateUser() {
  return useOptimisticMutation({
    request: (input: CreateUserInput) => ({
      method: 'POST' as const,
      path: api.users.$url().pathname,
      body: input,
    }),
    queue: false,
    keys: [meQueryOptions.queryKey],
    apply: (client, input) => {
      client.setQueryData(meQueryOptions.queryKey, (me) => {
        if (!me) return me;
        // 色の既定はサーバーと同じ規則（既存のユーザーから最も離れた色相）で決める
        const hue = input.hue ?? pickDistinctHue(me.users.map((user) => user.hue));
        const user = { id: crypto.randomUUID(), name: input.name, email: input.email, hue };
        return { ...me, users: [...me.users, user] };
      });
    },
  });
}

/** ユーザーの変更。パスワードを含みうるので、登録と同じくオフラインでは溜めない */
export function useUpdateUser() {
  return useOptimisticMutation({
    request: ({ id, ...input }: UpdateUserInput & { id: string }) => ({
      method: 'PATCH' as const,
      path: api.users[':id'].$url({ param: { id } }).pathname,
      body: input,
    }),
    queue: false,
    keys: [meQueryOptions.queryKey],
    apply: (client, { id, password: _password, ...input }) => {
      // パスワードは表示に関わらないので当てない。送らなかった項目（undefined）で今の値を消さない
      const changes = Object.fromEntries(
        Object.entries(input).filter(([, value]) => value !== undefined),
      ) as Partial<typeof input>;
      client.setQueryData(meQueryOptions.queryKey, (me) => {
        if (!me) return me;
        const users = me.users.map((user) => (user.id === id ? { ...user, ...changes } : user));
        return me.id === id ? { ...me, ...changes, users } : { ...me, users };
      });
    },
  });
}
