import { useQuery } from '@tanstack/react-query';
import { meQueryOptions } from '../../lib/auth.ts';
import { type User, useUsers } from './queries.ts';

/**
 * ユーザーの表示名と一覧。ユーザーはログイン中の人を先頭に並べる（自分も名前で出す）。
 * label(null) は「共有」（立替の To）。
 */
export function useUserLabels() {
  const { data: me } = useQuery(meQueryOptions);
  const { data } = useUsers();
  const users: User[] = (data ?? [])
    .slice()
    .sort((a, b) => (a.id === me?.id ? -1 : b.id === me?.id ? 1 : 0));

  const label = (userId: string | null): string => {
    if (userId === null) return '共有';
    return users.find((u) => u.id === userId)?.name ?? '';
  };

  return { users, label, meId: me?.id ?? null };
}
