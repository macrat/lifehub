import { useQuery } from '@tanstack/react-query';
import { meQueryOptions } from '../../lib/auth.ts';
import { type User, useUsers } from './queries.ts';

type OwnerOption = { value: string | null; label: string };

/**
 * ユーザーの表示名と選択肢。ユーザーはログイン中の人を先頭に並べる（自分も名前で出す）。
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

  const options: OwnerOption[] = [
    { value: null, label: '共有' },
    ...users.map((u) => ({ value: u.id, label: u.name })),
  ];

  return { users, label, options, meId: me?.id ?? null };
}
