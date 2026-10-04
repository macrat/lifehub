import { beforeEach, describe, expect, it } from 'vitest';
import { newId } from '../../shared/id.ts';
import type { CareLog } from '../../shared/lemon.ts';
import { app } from '../app.ts';
import { createKey } from '../features/api-keys/service.ts';
import { listLogs } from '../features/lemon/service.ts';
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
    const { key } = await createKey({ name: 'ボタン' }, userId);

    const before = Date.now();
    const res = await post({ type: 'lemon', careTypes: ['water', 'mist'] }, key);
    expect(res.status).toBe(201);
    const log = (await res.json()) as CareLog;
    expect(log.careTypes).toEqual(['mist', 'water']);
    // ボタンは誰が押しても同じキーで送るので、キーの持ち主を記録者にしない
    expect(log.createdBy).toBeNull();
    expect(log.apiKeyName).toBe('ボタン');
    // 日時を省くと受け取った時刻になる
    expect(new Date(log.doneAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('同じ id で送り直しても二重に作られない', async () => {
    const userId = await createTestUser('A');
    const { key } = await createKey({ name: 'ボタン' }, userId);
    const body = { type: 'lemon', id: newId(), careTypes: ['mist'] };

    expect((await post(body, key)).status).toBe(201);
    expect((await post(body, key)).status).toBe(201);
    expect((await listLogs({})).items).toHaveLength(1);
  });

  it('キーが無い・知らないキーは 401', async () => {
    await createTestUser('A');
    expect((await post({ type: 'lemon', careTypes: ['mist'] })).status).toBe(401);
    expect((await post({ type: 'lemon', careTypes: ['mist'] }, 'unknown')).status).toBe(401);
    expect((await listLogs({})).items).toEqual([]);
  });

  it('知らない種類や規則に合わない記録は 400', async () => {
    const userId = await createTestUser('A');
    const { key } = await createKey({ name: 'ボタン' }, userId);
    expect((await post({ type: 'unknown' }, key)).status).toBe(400);
    expect((await post({ type: 'lemon', careTypes: [] }, key)).status).toBe(400);
  });
});
