import { useQuery } from '@tanstack/react-query';
import { meQueryOptions } from '../../lib/auth.ts';
import { usersQueryOptions } from './queries.ts';

type OwnerOption = { value: string | null; label: string };

/**
 * 所有者・担当者の表示と選択肢。null は「共有」、それ以外はユーザー名（自分も名前で出す）。
 * 選択肢はログイン中のユーザーを先頭にする。
 */
export function useOwnerLabel() {
  const { data: me } = useQuery(meQueryOptions);
  const { data: users = [] } = useQuery(usersQueryOptions);

  const label = (userId: string | null): string => {
    if (userId === null) return '共有';
    return users.find((u) => u.id === userId)?.name ?? '';
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
