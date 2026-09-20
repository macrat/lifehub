import { useQuery } from '@tanstack/react-query';
import { meQueryOptions } from '../../lib/auth.ts';
import { usersQueryOptions } from './queries.ts';

export type OwnerOption = { value: string | null; label: string };

/**
 * 「自分／相手／共有」の表示と選択肢。users と me から決める。
 * null は共有、自分は「自分」、それ以外は相手の名前。
 */
export function useOwnerLabel() {
  const { data: me } = useQuery(meQueryOptions);
  const { data: users = [] } = useQuery(usersQueryOptions);

  const label = (userId: string | null): string => {
    if (userId === null) return '共有';
    if (userId === me?.id) return '自分';
    return users.find((u) => u.id === userId)?.name ?? '相手';
  };

  const options: OwnerOption[] = [
    { value: null, label: '共有' },
    ...users
      .slice()
      .sort((a, b) => (a.id === me?.id ? -1 : b.id === me?.id ? 1 : 0))
      .map((u) => ({ value: u.id, label: label(u.id) })),
  ];

  return { label, options, meId: me?.id ?? null };
}
