import { describe, expect, it, vi } from 'vitest';
import { batchUrl, createGetBatcher } from '../batch-get.ts';

/** 束ねた要求には、中の要求それぞれのパスを本文にして返す偽の送り口 */
function fakeSend() {
  return vi.fn(async (input: string) => {
    const url = new URL(input, 'http://localhost');
    if (url.pathname !== '/api/batch') return new Response(`one ${input}`);
    const paths = url.searchParams.getAll('r');
    return Response.json(paths.map((path) => ({ status: 200, body: `part ${path}` })));
  });
}

describe('GET をまとめて送る', () => {
  it('同じ時点に出た GET は 1 本にまとめ、それぞれに自分の結果を返す', async () => {
    const send = fakeSend();
    const get = createGetBatcher(send);
    const [me, timeline] = await Promise.all([get('/api/me'), get('/api/timeline?q=a')]);
    expect(await me.text()).toBe('part /api/me');
    expect(await timeline.text()).toBe('part /api/timeline?q=a');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(batchUrl(['/api/me', '/api/timeline?q=a']));
  });

  it('並びを揃えて、同じ組み合わせを同じ URL にする', () => {
    expect(batchUrl(['/api/me', '/api/lemon/status'])).toBe(
      '/api/batch?r=%2Fapi%2Fme&r=%2Fapi%2Flemon%2Fstatus',
    );
    const send = fakeSend();
    const get = createGetBatcher(send);
    void get('/api/me');
    void get('/api/lemon/status');
    return vi.waitFor(() =>
      expect(send).toHaveBeenCalledWith(batchUrl(['/api/lemon/status', '/api/me'])),
    );
  });

  it('1 本だけなら、まとめずに元の指定のまま送る', async () => {
    const send = fakeSend();
    const get = createGetBatcher(send);
    const init = { headers: { 'x-test': '1' } };
    const res = await get('/api/me', init);
    expect(await res.text()).toBe('one /api/me');
    expect(send).toHaveBeenCalledWith('/api/me', init);
  });

  it('同じパスが重なっても 1 つとして運び、それぞれに結果を返す', async () => {
    const send = fakeSend();
    const get = createGetBatcher(send);
    const results = await Promise.all([get('/api/me'), get('/api/me'), get('/api/weather')]);
    expect(await Promise.all(results.map((res) => res.text()))).toEqual([
      'part /api/me',
      'part /api/me',
      'part /api/weather',
    ]);
    expect(send).toHaveBeenCalledWith(batchUrl(['/api/me', '/api/weather']));
  });

  it('束ね全体が失敗したら（未認証など）、中の要求それぞれが同じ失敗を受け取る', async () => {
    const get = createGetBatcher(async () => new Response('ログインが必要です', { status: 401 }));
    const results = await Promise.all([get('/api/me'), get('/api/weather')]);
    expect(results.map((res) => res.status)).toEqual([401, 401]);
    expect(await results[0]?.text()).toBe('ログインが必要です');
  });

  it('通信できなければ、中の要求がそれぞれ失敗する', async () => {
    const get = createGetBatcher(async () => {
      throw new TypeError('Failed to fetch');
    });
    const results = await Promise.allSettled([get('/api/me'), get('/api/weather')]);
    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
  });

  it('中断した要求だけが中断で終わり、ほかは結果を受け取る', async () => {
    const send = fakeSend();
    const get = createGetBatcher(send);
    const controller = new AbortController();
    const aborted = get('/api/timeline', { signal: controller.signal });
    const other = get('/api/me');
    controller.abort();
    await expect(aborted).rejects.toThrow();
    expect(await (await other).text()).toBe('part /api/me');
  });

  it('1 本で運べる数を超えたら、何本かの束ねに分ける', async () => {
    const send = fakeSend();
    const get = createGetBatcher(send);
    const paths = Array.from({ length: 25 }, (_, i) => `/api/events/${String(i).padStart(2, '0')}`);
    const results = await Promise.all(paths.map((path) => get(path)));
    expect(await Promise.all(results.map((res) => res.text()))).toEqual(
      paths.map((path) => `part ${path}`),
    );
    expect(send).toHaveBeenCalledTimes(2);
  });
});
