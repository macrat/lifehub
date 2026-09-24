import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../app.ts';
import { truncateAll } from '../lib/test-db.ts';
import { loginAs } from './login.ts';

/** 名前と色を出す所は本人と一覧を必ず一緒に読むので、`/api/me` が 1 回で両方を返す */
describe('/api/me', () => {
  beforeEach(truncateAll);

  it('ログイン中のユーザーと一緒にユーザーの一覧を返す', async () => {
    const { userId, cookie } = await loginAs('A');
    const { userId: partnerId } = await loginAs('B');
    const res = await app.request('/api/me', { headers: { cookie } });
    expect(await res.json()).toMatchObject({
      id: userId,
      users: [
        { id: userId, name: 'A' },
        { id: partnerId, name: 'B' },
      ],
    });
  });
});
