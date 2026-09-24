import { onlineManager } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Me, meQueryOptions } from '../auth.ts';
import { persistOptions, queryClient } from '../query-client.ts';

/** 書き込みの既定（setMutationDefaults）を当てた mutation を作る。溜める書き込みは 'write'、溜めないものは 'direct-write' */
function buildWrite(key: 'write' | 'direct-write' = 'write') {
  return queryClient.getMutationCache().build(queryClient, { mutationKey: [key] });
}

/** 書き込みを、送り直しを待っていた書き込みとして走らせる */
function runWrite(author: string | null, key: 'write' | 'direct-write' = 'write') {
  const mutation = buildWrite(key);
  const done = mutation.execute({
    request: { method: 'POST', path: '/api/lemon/logs', body: {} },
    keys: [],
    input: {},
    author,
  });
  return { mutation, done };
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

    await expect(runWrite('u1').done).rejects.toThrow('ログインしているユーザーが変わった');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('書いた人がログインしたままなら送る', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    queryClient.setQueryData(meQueryOptions.queryKey, { id: 'u1' } as Me);

    await runWrite('u1').done;
    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe('溜めない書き込み', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    onlineManager.setOnline(true);
    queryClient.clear();
  });

  /**
   * パスワードを含むユーザーの変更などは端末に残さない。溜めた書き込みの後ろで順番を待つと、
   * 待つ間は保留中として端末に残り、オンラインに戻るまで結果も出ない。
   */
  it('オフラインで溜めた書き込みがあっても順番を待たず、その場で失敗し、端末に残らない', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    queryClient.setQueryData(meQueryOptions.queryKey, { id: 'u1' } as Me);
    onlineManager.setOnline(false);

    const queued = runWrite('u1');
    void queued.done.catch(() => {});
    await vi.waitFor(() => expect(queued.mutation.state.isPaused).toBe(true));

    const direct = runWrite('u1', 'direct-write');
    await expect(direct.done).rejects.toThrow();
    const { shouldDehydrateMutation } = persistOptions.dehydrateOptions;
    expect(shouldDehydrateMutation(direct.mutation)).toBe(false);
    expect(shouldDehydrateMutation(queued.mutation)).toBe(true);
  });
});
