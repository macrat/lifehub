import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * better-auth の初期化（MCP リソースの登録で DB に問い合わせる）の失敗から立ち直れるか。
 * getAuth は作ったものをモジュールに持つので、他のテストファイルが作ったものを使わないよう読み込み直す。
 */
async function load() {
  vi.resetModules();
  const [{ getAuth }, { db }] = await Promise.all([
    import('../auth.ts'),
    import('../db/client.ts'),
  ]);
  return { getAuth, db };
}

afterEach(() => {
  vi.restoreAllMocks();
  // 後のテストファイルが、このファイルで作ったモジュールを使わないようにする
  vi.resetModules();
});

describe('getAuth', () => {
  it('初期化に失敗したら、次の呼び出しで作り直す', async () => {
    const { getAuth, db } = await load();
    vi.spyOn(db, 'select').mockImplementationOnce(() => {
      throw new Error('fetch failed');
    });

    await expect(getAuth()).rejects.toThrow('fetch failed');

    const auth = await getAuth();
    expect(await getAuth()).toBe(auth);
  });
});
