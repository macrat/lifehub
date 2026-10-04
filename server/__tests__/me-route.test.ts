import { beforeEach, describe, expect, it } from 'vitest';
import { clearTables, createTestUser } from '../lib/db/test-db.ts';
import { apiClient, loginAs } from './login.ts';

/** 名前と色を出す所は本人と一覧を必ず一緒に読むので、`me.get` が 1 回で両方を返す */
describe('me.get', () => {
  beforeEach(clearTables);

  it('ログイン中のユーザーと一緒にユーザーの一覧を返す', async () => {
    const { userId, cookie } = await loginAs('A');
    const partnerId = await createTestUser('B');
    expect(await apiClient(cookie).me.get.query()).toMatchObject({
      id: userId,
      email: 'a@example.com',
      users: [
        { id: userId, name: 'A' },
        { id: partnerId, name: 'B' },
      ],
    });
  });
});
