import { useMemo } from 'react';
import { meQueryOptions } from '../../lib/auth.ts';
import { useStoreQuery } from '../../lib/screen-data.ts';
import { type User, usersOf } from './queries.ts';

/**
 * ユーザーの表示名と一覧。ユーザーはログイン中の人を先頭に並べる（自分も名前で出す）。
 * label(null) は「共有」（立替の To・From）。
 */
export function useUserLabels() {
  // ログイン中のユーザーと一覧は同じ `me.get` に載っているので、1 つのキャッシュから読む（`useUsers`）
  const { data: me } = useStoreQuery(meQueryOptions);
  const users: User[] = useMemo(
    () => usersOf(me).toSorted((a, b) => (a.id === me?.id ? -1 : b.id === me?.id ? 1 : 0)),
    [me],
  );

  const label = (userId: string | null): string => {
    if (userId === null) return '共有';
    return users.find((u) => u.id === userId)?.name ?? '';
  };

  /**
   * 記録がどこから書かれたか。人の代わりに入口（レモンの記録の API キー、メモの MCP クライアント）の名前を
   * 持つ記録はそれを、持たなければ書いた人の名前を出す。書いた人の null（先回りで出した記録の、まだ分からない
   * 書いた人）は空にする（`label` の null は立替の「共有」で、書いた人には当てはまらない）
   */
  const writerName = (createdBy: string | null, via: string | null): string =>
    via ?? (createdBy === null ? '' : label(createdBy));

  return { users, label, writerName, meId: me?.id ?? null };
}
