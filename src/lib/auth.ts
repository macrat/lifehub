import { queryOptions } from '@tanstack/react-query';
import { createAuthClient } from 'better-auth/react';
import { api } from './api.ts';

/** better-auth のクライアント。ログイン・ログアウトだけに使い、ログイン状態の参照は meQueryOptions で行う。 */
export const authClient = createAuthClient({ basePath: '/api/auth' });

export type Me = { id: string; name: string; email: string };

/**
 * ログイン中のユーザー。未認証なら null。
 * TanStack Query に載せることで永続化キャッシュの対象になり、オフライン起動時も前回のユーザーで描画できる。
 */
export const meQueryOptions = queryOptions({
  queryKey: ['me'],
  queryFn: async (): Promise<Me | null> => {
    const res = await api.me.$get();
    if (res.status === 401) return null;
    if (!res.ok) throw new Error('ユーザー情報の取得に失敗しました');
    return res.json();
  },
  staleTime: 1000 * 60 * 5,
});
