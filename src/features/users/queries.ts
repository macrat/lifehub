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
  /**
   * 1 時間は取り直さない。
   * WHY: 名前と色（`shared/color.ts` の色相）だけの 2 人分で、変わるのは色を変えたときと名前を
   * 直したときだけ。それを読む部品（`use-user-labels.ts` / `use-user-color.ts`）は予定の枠から
   * 立替の一覧まで画面中に散らばっているので、既定（staleTime: 0）だと画面を移るたび、
   * カレンダーの表示を切り替えるたびに、同じ内容を取り直すことになる。
   * WHY NOT 無期限: 相手が自分の色や名前を変えたら、こちらにもいつかは映ってほしい。
   * 自分で変えたときは書き込みが invalidate するので、この時間を待たずに入れ替わる。
   */
  staleTime: 1000 * 60 * 60,
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

/** ユーザーの変更。パスワードを含みうるので、登録と同じくオフラインでは溜めない */
export function useUpdateUser() {
  return useOptimisticMutation({
    request: ({ id, ...input }: UpdateUserInput & { id: string }) => ({
      method: 'PATCH' as const,
      path: api.users[':id'].$url({ param: { id } }).pathname,
      body: input,
    }),
    queue: false,
    keys: [usersQueryOptions.queryKey, meQueryOptions.queryKey],
    apply: (client, { id, password: _password, ...input }) => {
      // パスワードは表示に関わらないので当てない。送らなかった項目（undefined）で今の値を消さない
      const changes = Object.fromEntries(
        Object.entries(input).filter(([, value]) => value !== undefined),
      ) as Partial<typeof input>;
      client.setQueryData(usersQueryOptions.queryKey, (users) =>
        users?.map((user) => (user.id === id ? { ...user, ...changes } : user)),
      );
      client.setQueryData(meQueryOptions.queryKey, (me) =>
        me && me.id === id ? { ...me, ...changes } : me,
      );
    },
  });
}
