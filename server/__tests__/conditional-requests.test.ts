import { beforeEach, describe, expect, it } from 'vitest';
import type { MoneyRecord } from '../../shared/money.ts';
import type { HistoryPage } from '../../shared/types.ts';
import { dateStringSchema } from '../../shared/validation/common.ts';
import { app } from '../app.ts';
import { addExpense } from '../features/money/service.ts';
import { updateUser } from '../features/users/service.ts';
import { clearTables } from '../lib/db/test-db.ts';
import { loginAs } from './login.ts';

/**
 * 変わっていない応答を再送しないこと（ETag と条件付き要求）。
 * 既定の staleTime は 0 で画面を開くたびに取り直すので、ここが効かないと一覧を毎回丸ごと転送する。
 */
describe('条件付き要求', () => {
  let cookie: string;
  let userId: string;

  beforeEach(async () => {
    await clearTables();
    ({ userId, cookie } = await loginAs('A'));
  });

  /** 画面の API の読み出し 1 つを GET で送る（tRPC の URL の形。入力は JSON にしてクエリに載せる） */
  const get = (procedure: string, input: unknown, etag?: string) =>
    app.request(`/api/trpc/${procedure}?input=${encodeURIComponent(JSON.stringify(input))}`, {
      headers: { cookie, ...(etag ? { 'if-none-match': etag } : {}) },
    });
  const dataOf = async <T>(res: Response) =>
    ((await res.json()) as { result: { data: T } }).result.data;

  it('内容が同じなら 304 を返し、本文を送らない', async () => {
    const first = await get('money.list', {});
    expect(first.status).toBe(200);
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();
    expect(first.headers.get('cache-control')).toBe('private, no-cache');

    const second = await get('money.list', {}, etag ?? '');
    expect(second.status).toBe(304);
    expect(await second.text()).toBe('');
  });

  it('内容が変わったら 200 で新しい本文を返す', async () => {
    const etag = (await get('money.list', {})).headers.get('etag') ?? '';
    await addExpense(
      {
        fromUserId: userId,
        toUserId: null,
        amount: 1200,
        description: '牛乳',
        occurredOn: dateStringSchema.parse('2026-09-14'),
      },
      userId,
    );
    const res = await get('money.list', {}, etag);
    expect(res.status).toBe(200);
    expect((await dataOf<HistoryPage<MoneyRecord>>(res)).items).toHaveLength(1);
  });

  it('me.get は色の変更に追従する（セッションから返しても古くならない）', async () => {
    expect(await dataOf(await get('me.get', undefined))).toMatchObject({ name: 'A', hue: 335 });
    await updateUser(userId, { hue: 120 });
    expect(await dataOf(await get('me.get', undefined))).toMatchObject({ hue: 120 });
  });
});
