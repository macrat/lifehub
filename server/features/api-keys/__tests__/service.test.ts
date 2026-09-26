import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError } from '../../../lib/errors.ts';
import { createTestUser, truncateAll } from '../../../lib/test-db.ts';
import { authenticate, createKey, listKeys, revokeKey } from '../service.ts';

const now = new Date('2026-09-24T03:00:00Z');

let userId: string;
let otherId: string;

describe('api-keys service', () => {
  beforeEach(async () => {
    await truncateAll();
    userId = await createTestUser('A');
    otherId = await createTestUser('B');
  });

  it('発行したキーで持ち主と名前が分かり、最後に使われた日時を記録する', async () => {
    const issued = await createKey({ name: 'レモンのボタン' }, userId);
    expect(issued.key).toMatch(/^[\w-]{43}$/);
    expect(issued.lastUsedAt).toBeNull();

    expect(await authenticate(issued.key, now)).toEqual({ userId, name: 'レモンのボタン' });
    const [listed] = await listKeys(userId);
    expect(listed).toEqual({
      id: issued.id,
      name: 'レモンのボタン',
      createdAt: issued.createdAt,
      lastUsedAt: now.toISOString(),
    });
  });

  it('一覧にはキーそのものを出さない', async () => {
    await createKey({ name: 'ボタン' }, userId);
    const [listed] = await listKeys(userId);
    expect(listed).not.toHaveProperty('key');
  });

  it('知らないキーは通さない', async () => {
    await createKey({ name: 'ボタン' }, userId);
    expect(await authenticate('unknown-key', now)).toBeUndefined();
  });

  it('失効したキーは通らず、他人のキーは失効できない', async () => {
    const issued = await createKey({ name: 'ボタン' }, userId);
    await expect(revokeKey(issued.id, otherId)).rejects.toThrow(NotFoundError);
    expect(await authenticate(issued.key, now)).toMatchObject({ userId });

    await revokeKey(issued.id, userId);
    expect(await authenticate(issued.key, now)).toBeUndefined();
    expect(await listKeys(userId)).toEqual([]);
  });

  it('一覧は自分のキーだけ', async () => {
    await createKey({ name: '自分の' }, userId);
    await createKey({ name: '相手の' }, otherId);
    expect((await listKeys(userId)).map((key) => key.name)).toEqual(['自分の']);
  });
});
