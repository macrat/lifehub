import { useQuery } from '@tanstack/react-query';
import { pickDistinctHue } from '../../../shared/color.ts';
import { newId } from '../../../shared/id.ts';
import type { CreateUserInput, UpdateUserInput } from '../../../shared/validation/users.ts';
import { api, createRequest, itemRequest } from '../../lib/api.ts';
import { type Me, meQueryOptions } from '../../lib/auth.ts';
import { useOptimisticMutation } from '../../lib/query-client.ts';

export type User = Me['users'][number];

const NO_USERS: User[] = [];

function usersOf(me: Me | null): User[] {
  return me?.users ?? NO_USERS;
}

/**
 * ユーザーの一覧。ログイン中のユーザーと一緒に `/api/me` に載ってくるので、そのキャッシュから読む
 * （取り直しの間隔も `meQueryOptions` に従う）。書き込みで変えるのも `meQueryOptions` のキャッシュ。
 * WHY: 名前と色を出す所（`use-user-labels.ts` など）は本人と一覧を必ず一緒に読むので、
 * 別々に問い合わせると 2 本になる。
 */
export function useUsers() {
  return useQuery({ ...meQueryOptions, select: usersOf });
}

/**
 * ユーザーの登録。オフラインでは溜めずにその場で失敗させる（queue: false）。
 * パスワードを含むので端末に残したくなく、2 人しか居ないアプリで急ぐ操作でもない。
 */
export function useCreateUser() {
  return useOptimisticMutation({
    request: createRequest<CreateUserInput>(api.users),
    queue: false,
    keys: [meQueryOptions.queryKey],
    apply: (client, input) => {
      client.setQueryData(meQueryOptions.queryKey, (me) => {
        if (!me) return me;
        // 色の既定はサーバーと同じ規則（既存のユーザーから最も離れた色相）で決める
        const hue = input.hue ?? pickDistinctHue(me.users.map((user) => user.hue));
        const user = { id: newId(), name: input.name, email: input.email, hue };
        return { ...me, users: [...me.users, user] };
      });
    },
  });
}

/** ユーザーの変更。パスワードを含みうるので、登録と同じくオフラインでは溜めない */
export function useUpdateUser() {
  return useOptimisticMutation({
    request: itemRequest<UpdateUserInput & { id: string }>('PATCH', api.users[':id']),
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
        return { ...me, ...(me.id === id ? changes : {}), users };
      });
    },
  });
}
