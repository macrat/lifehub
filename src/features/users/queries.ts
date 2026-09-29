import type { CreateUserInput, UpdateUserInput } from '../../../shared/validation/users.ts';
import { api, createRequest, itemRequest } from '../../lib/api.ts';
import { type Me, meQueryOptions } from '../../lib/auth.ts';
import { useOptimisticMutation } from '../../lib/query-client.ts';
import { useStoreQuery } from '../../lib/screen-data.ts';

export type User = Me['users'][number];

/** ユーザーがまだ読めていないときの一覧。いつも同じ配列を返し、それを元にした memo を無駄に作り直さない */
export const NO_USERS: User[] = [];

/** `/api/me` の応答 → ユーザーの一覧（未ログイン・まだ読めていなければ空） */
export function usersOf(me: Me | null | undefined): User[] {
  return me?.users ?? NO_USERS;
}

/**
 * ユーザーの一覧。ログイン中のユーザーと一緒に `/api/me` に載ってくるので、そのキャッシュから読む
 * （購読はログインが要る画面をまとめるレイアウト `routes/_authenticated.tsx`。取り直しの間隔は `meQueryOptions` に従う）。書き込みで変えるのも `meQueryOptions` のキャッシュ。
 * WHY: 名前と色を出す所（`use-user-labels.ts` など）は本人と一覧を必ず一緒に読むので、
 * 別々に問い合わせると 2 本になる。
 */
export function useUsers() {
  return useStoreQuery({ ...meQueryOptions, select: usersOf });
}

/**
 * ユーザーの登録。オフラインでは溜めずにその場で失敗させる（queue: false）。
 * パスワードを含むので端末に残したくなく、2 人しか居ないアプリで急ぐ操作でもない。
 * 楽観的更新の `apply` は持たない（配信 URL の発行と同じ）。ユーザーの ID はサーバー（better-auth）が
 * 決めるので、先に出す行には本物と違う仮の ID しか付けられず、取り直しが届く前にその行を編集すると
 * 無い ID へ送ってしまう。フォームはどのみち返事を待つので、一覧には取り直しで本物の行を出す。
 */
export function useCreateUser() {
  return useOptimisticMutation({
    request: createRequest<CreateUserInput>(api.users),
    queue: false,
    keys: [meQueryOptions.queryKey],
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
