import { afterEach, describe, expect, it, vi } from 'vitest';

// getAuth は作ったものをモジュールに持つので、他のテストファイルとの間で持ち越さないよう読み込み直す
afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('getAuth', () => {
  it('初期化（MCP リソースの登録で DB に問い合わせる）に失敗しても、同じインスタンスを返し続ける', async () => {
    vi.resetModules();
    const { getAuth } = await import('../auth.ts');
    const { db } = await import('../db/client.ts');
    vi.spyOn(db, 'select').mockImplementationOnce(() => {
      throw new Error('fetch failed');
    });

    const auth = await getAuth();
    expect(await getAuth()).toBe(auth);
  });
});
