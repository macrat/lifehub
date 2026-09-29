import { onlineManager, QueryClientProvider } from '@tanstack/react-query';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Me, meQueryOptions } from '../auth.ts';
import {
  persistOptions,
  queryClient,
  useIsLoadingWithoutCache,
  useOptimisticMutation,
} from '../query-client.ts';
import { useNotice } from '../ui/notice.ts';

// React の act を使う（テスト用の描画ライブラリは入れていない）
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** フックを queryClient の下で描き、描くたびの戻り値を read で読めるようにする */
function renderHook<T>(hook: () => T) {
  let value!: T;
  function Probe() {
    value = hook();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() =>
    root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe))),
  );
  return { read: () => value, unmount: () => act(() => root.unmount()) };
}

/** 書き込みの既定（setMutationDefaults）を当てた mutation を作る。溜める書き込みは 'write'、溜めないものは 'direct-write' */
function buildWrite(key: 'write' | 'direct-write' = 'write') {
  return queryClient.getMutationCache().build<unknown, Error, unknown, unknown>(queryClient, {
    mutationKey: [key],
  });
}

/** 書き込みを、送り直しを待っていた書き込みとして走らせる */
function runWrite(author: string | null, key: 'write' | 'direct-write' = 'write') {
  const mutation = buildWrite(key);
  const done = mutation.execute({
    request: { path: 'lemon.create', input: {} },
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
      .mockResolvedValue(Response.json([{ result: { data: null } }]));
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

/**
 * 画面上部の細いインジケータは、手元に何も出せないまま待っているときだけ出す。
 * どの画面もマウントのたびに裏で取り直すので、キャッシュを出しながらの取り直しまで数えると
 * 画面を移るたびに毎回出てしまう。
 */
describe('useIsLoadingWithoutCache', () => {
  afterEach(() => {
    queryClient.clear();
  });

  it('キャッシュを出しながらの取り直しでは出さず、データの無い取得を待つ間だけ出す', async () => {
    const pending = () => new Promise<never>(() => {});
    queryClient.setQueryData(['cached'], 'shown');
    void queryClient.prefetchQuery({ queryKey: ['cached'], queryFn: pending });
    expect(queryClient.isFetching({ queryKey: ['cached'] })).toBe(1);
    // 取り直しの最中に描き始める（描いた時点の値を読むので、通知の遅れに左右されない）
    const { read, unmount } = renderHook(useIsLoadingWithoutCache);
    expect(read()).toBe(false);

    void queryClient.prefetchQuery({ queryKey: ['empty'], queryFn: pending });
    await vi.waitFor(() => expect(read()).toBe(true));
    unmount();
  });
});

describe('書き込みの失敗', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    queryClient.clear();
  });

  it('投機的に出した値を送信前へ戻して理由を知らせ、次の書き込みは待たされずに送れる', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json(
          [
            {
              error: {
                message: '保存できませんでした',
                code: -32600,
                data: { code: 'BAD_REQUEST', httpStatus: 400 },
              },
            },
          ],
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(Response.json([{ result: { data: null } }]));
    queryClient.setQueryData(meQueryOptions.queryKey, { id: 'u1' } as Me);
    queryClient.setQueryData(['items'], ['a']);
    const { read, unmount } = renderHook(() => ({
      write: useOptimisticMutation<string>({
        request: (text) => ({ path: 'items.add', input: { text } }),
        keys: [['items']],
        apply: (client, text) =>
          client.setQueryData<string[]>(['items'], (old) => [...(old ?? []), text]),
      }),
      notice: useNotice(),
    }));
    const items = () => queryClient.getQueryData(['items']);

    await act(() => read().write.mutateAsync('b'));
    // 知らせは画面全体で 1 つなので、前のテストの知らせが開いたまま残っていることがある。この書き込みの知らせを待つ
    await vi.waitFor(() =>
      expect(read().notice).toMatchObject({
        open: true,
        severity: 'error',
        message: '保存できませんでした',
      }),
    );
    expect(items()).toEqual(['a']);

    await act(() => read().write.mutateAsync('c'));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(items()).toEqual(['a', 'c']);
    unmount();
  });
});
