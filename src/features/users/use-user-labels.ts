import { useMemo } from 'react';
import { meQueryOptions } from '../../lib/auth.ts';
import { useStoreQuery } from '../../lib/screen-data.ts';
import { type User, usersOf } from './queries.ts';

/**
 * ユーザーの表示名と一覧。ユーザーはログイン中の人を先頭に並べる（自分も名前で出す）。
 * label(null) は「共有」（立替の To）。
 */
export function useUserLabels() {
  // ログイン中のユーザーと一覧は同じ `/api/me` に載っているので、1 つのキャッシュから読む（`useUsers`）
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
   * 記録を書いた人の名前。null（先回りで出した記録の、まだ分からない書いた人）は空にする
   * （`label` の null は立替の「共有」で、書いた人には当てはまらない）
   */
  const authorName = (userId: string | null): string => (userId === null ? '' : label(userId));

  return { users, label, authorName, meId: me?.id ?? null };
}
