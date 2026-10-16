import { beforeEach, describe, expect, it } from 'vitest';
import { newId } from '../../shared/id.ts';
import { app } from '../app.ts';
import { createKey } from '../features/api-keys/service.ts';
import { listLogs, logCare, updateLog } from '../features/lemon/service.ts';
import { clearTables, createTestUser } from '../lib/db/test-db.ts';

/**
 * 記録投入用エンドポイント（`POST /api/records`）。セッションより前に登録し、API キーだけを資格にする。
 * 取り違えると誰でも記録を入れられるか、逆にデバイスから入れられなくなるので、入口の扱いをここで確かめる。
 */
describe('記録投入のルート', () => {
  beforeEach(clearTables);

  const post = (body: unknown, key?: string) =>
    app.request('/api/records', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify(body),
    });

  it('API キーで記録でき、記録した人は不明になり、キーの名前が残る', async () => {
    const userId = await createTestUser('A');
    const { secret: key } = await createKey({ name: 'ボタン' }, userId);

    const before = Date.now();
    const res = await post({ type: 'lemon', careTypes: ['water', 'mist'] }, key);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    const { items } = await listLogs({});
    expect(items).toHaveLength(1);
    // ボタンは誰が押しても同じキーで送るので、キーの持ち主を記録者にしない
    expect(items).toMatchObject([
      { careTypes: ['mist', 'water'], createdBy: null, apiKeyName: 'ボタン' },
    ]);
    // 日時を省くと受け取った時刻になる
    expect(new Date(items[0]?.doneAt ?? 0).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('編集後に同じ id で送り直しても、中身を返さず二重作成も上書きもしない', async () => {
    const userId = await createTestUser('A');
    const { secret: key } = await createKey({ name: 'ボタン' }, userId);
    const body = { type: 'lemon', id: newId(), careTypes: ['mist'] };

    const first = await post(body, key);
    expect(first.status).toBe(201);
    expect(await first.json()).toEqual({ ok: true });
    await updateLog(
      body.id,
      { careTypes: ['water'], doneAt: new Date(), note: '画面で追記' },
      userId,
    );

    const replay = await post(body, key);
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual({ ok: true });
    expect((await listLogs({})).items).toMatchObject([
      { id: body.id, careTypes: ['water'], note: '画面で追記' },
    ]);
  });

  it('画面で作った記録の id を指定しても、中身を返さず上書きもしない', async () => {
    const userId = await createTestUser('A');
    const { secret: key } = await createKey({ name: 'ボタン' }, userId);
    const log = await logCare(
      { careTypes: ['water'], doneAt: new Date(), note: '画面の記録' },
      { userId },
    );

    const res = await post({ type: 'lemon', id: log.id, careTypes: ['mist'], note: '投入' }, key);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    expect((await listLogs({})).items).toEqual([log]);
  });

  it('キーが無い・知らないキーは 401', async () => {
    await createTestUser('A');
    expect((await post({ type: 'lemon', careTypes: ['mist'] })).status).toBe(401);
    expect((await post({ type: 'lemon', careTypes: ['mist'] }, 'unknown')).status).toBe(401);
    expect((await listLogs({})).items).toEqual([]);
  });

  it('知らない種類や規則に合わない記録は 400', async () => {
    const userId = await createTestUser('A');
    const { secret: key } = await createKey({ name: 'ボタン' }, userId);
    expect((await post({ type: 'unknown' }, key)).status).toBe(400);
    expect((await post({ type: 'lemon', careTypes: [] }, key)).status).toBe(400);
  });
});
