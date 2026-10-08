import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '../query-client.ts';
import { useIsLoadingWithoutCache } from '../screen-data.ts';
import { renderHook } from './render-hook.ts';

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
    const { read } = renderHook(useIsLoadingWithoutCache, { client: queryClient });
    expect(read()).toBe(false);

    void queryClient.prefetchQuery({ queryKey: ['empty'], queryFn: pending });
    await vi.waitFor(() => expect(read()).toBe(true));
  });
});
