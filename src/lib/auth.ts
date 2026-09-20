import { oauthProviderClient } from '@better-auth/oauth-provider/client';
import { queryOptions, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { createAuthClient } from 'better-auth/react';
import { api } from './api.ts';

/**
 * better-auth のクライアント。ログイン・ログアウト・OAuth の同意に使い、ログイン状態の参照は meQueryOptions で行う。
 * oauthProviderClient は、MCP クライアントの認可フローでログイン／同意画面に付く署名付きクエリを API 呼び出しに添える。
 */
export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [oauthProviderClient()],
});

export type Me = { id: string; name: string; email: string; hue: number };

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

/** ログアウト。キャッシュを捨ててログイン画面へ送る（me だけは「未ログイン」として残し、次回起動で即ログイン画面に出す） */
export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await authClient.signOut();
    queryClient.setQueryData(meQueryOptions.queryKey, null);
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    await navigate({ to: '/login' });
  };
}
