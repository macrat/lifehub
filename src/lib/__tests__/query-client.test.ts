import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Me, meQueryOptions } from '../auth.ts';
import { queryClient } from '../query-client.ts';

/** 書き込みの既定（setMutationDefaults）を当てた mutation を、送り直しを待っていた書き込みとして走らせる */
function runWrite(author: string | null) {
  const mutation = queryClient.getMutationCache().build(queryClient, { mutationKey: ['write'] });
  return mutation.execute({
    request: { method: 'POST', path: '/api/lemon/logs', body: {} },
    keys: [],
    input: {},
    author,
  });
}

describe('書き込みの送信', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    queryClient.clear();
  });

  /**
   * 送り直しを待っている間にログインし直したユーザーの記録として保存しない。
   * ログアウトでも送信中の mutation は止まらないので、送る試行のたびに確かめる。
   */
  it('書いた人と今ログインしている人が違えば送らずに諦める', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    queryClient.setQueryData(meQueryOptions.queryKey, { id: 'u2' } as Me);

    await expect(runWrite('u1')).rejects.toThrow('ログインしているユーザーが変わった');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('書いた人がログインしたままなら送る', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    queryClient.setQueryData(meQueryOptions.queryKey, { id: 'u1' } as Me);

    await runWrite('u1');
    expect(fetch).toHaveBeenCalledOnce();
  });
});
