import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { type Me, markSignedOut, meQueryOptions } from '../auth.ts';

describe('未ログインの反映', () => {
  /**
   * 溜めた書き込みは送る時点のセッションで送られる。残っていると、次にログインした
   * 別のユーザーとして送られてしまう。
   */
  it('溜めた書き込みを捨て、me を未ログインにする', () => {
    const client = new QueryClient();
    client.getMutationCache().build(client, { mutationKey: ['write'] });
    client.setQueryData(meQueryOptions.queryKey, { id: 'u1' } as Me);

    markSignedOut(client);

    expect(client.getMutationCache().getAll()).toHaveLength(0);
    expect(client.getQueryData(meQueryOptions.queryKey)).toBeNull();
  });
});
