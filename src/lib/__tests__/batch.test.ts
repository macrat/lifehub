import { describe, expect, it, vi } from 'vitest';
import { batchLoads } from '../batch.ts';

const live = () => new AbortController().signal;

/** 鍵をそのまま値にして返す load（呼ばれた鍵と中断の印を残す） */
function echo() {
  const calls: { keys: string[]; signal: AbortSignal }[] = [];
  const load = vi.fn(async (keys: string[], signal: AbortSignal) => {
    calls.push({ keys, signal });
    return Object.fromEntries(keys.map((key) => [key, `value:${key}`]));
  });
  return { load, calls };
}

describe('batchLoads', () => {
  it('同じ時点に頼まれた鍵は、重複を除いて 1 回で読み、それぞれに自分の値を返す', async () => {
    const { load, calls } = echo();
    const get = batchLoads(load);
    const values = await Promise.all([get('a', live()), get('b', live()), get('a', live())]);
    expect(values).toEqual(['value:a', 'value:b', 'value:a']);
    expect(calls.map((call) => call.keys)).toEqual([['a', 'b']]);
  });

  it('別の時点に頼まれた鍵は別々に読む', async () => {
    const { load, calls } = echo();
    const get = batchLoads(load);
    await get('a', live());
    await get('b', live());
    expect(calls.map((call) => call.keys)).toEqual([['a'], ['b']]);
  });

  it('読めなければ、まとめた頼み手すべてに失敗を返す', async () => {
    const get = batchLoads(async () => {
      throw new Error('offline');
    });
    const results = await Promise.allSettled([get('a', live()), get('b', live())]);
    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
  });

  it('値の返らなかった鍵の頼み手には失敗を返す', async () => {
    const get = batchLoads(async () => ({ a: 1 }));
    const [a, b] = await Promise.allSettled([get('a', live()), get('b', live())]);
    expect(a).toEqual({ status: 'fulfilled', value: 1 });
    expect(b?.status).toBe('rejected');
  });

  it('中断は、まとめた頼み手がすべて中断したときだけ伝える', async () => {
    const { load, calls } = echo();
    const get = batchLoads(load);
    const [first, second] = [new AbortController(), new AbortController()];
    const done = Promise.all([get('a', first.signal), get('b', second.signal)]);
    await Promise.resolve();
    const [call] = calls;
    first.abort();
    expect(call?.signal.aborted).toBe(false);
    second.abort();
    expect(call?.signal.aborted).toBe(true);
    await done;
  });

  it('送り出す前にすべての頼み手が中断していれば、中断した状態で読み始める', async () => {
    const { load, calls } = echo();
    const get = batchLoads(load);
    const controller = new AbortController();
    const done = get('a', controller.signal);
    controller.abort();
    await done;
    expect(calls[0]?.signal.aborted).toBe(true);
  });
});
