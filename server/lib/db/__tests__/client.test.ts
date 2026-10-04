import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { users } from '../../../features/users/schema.ts';
import { db, runBatch } from '../client.ts';
import { clearTables, createTestUser } from '../test-db.ts';

/**
 * runBatch は全文が通るか何も残らないかのどちらかになること。
 * 本番（neon-http）は db.batch() が、ローカル・CI（node-postgres）はトランザクションがこれを守る。
 */
describe('runBatch', () => {
  beforeEach(clearTables);

  it('途中で失敗したら前の文も残さない', async () => {
    const userId = await createTestUser('A');
    await expect(
      runBatch((tx) => [
        tx.update(users).set({ name: '変更後' }).where(eq(users.id, userId)),
        // email は unique なので、既にある値で 2 件目を作ろうとすると必ず失敗する
        tx.insert(users).values({ id: crypto.randomUUID(), name: 'B', email: 'a@example.com' }),
      ]),
    ).rejects.toThrow();
    const [row] = await db.select().from(users).where(eq(users.id, userId));
    expect(row?.name).toBe('A');
  });

  it('読み取りの文は型で拒む（読み取りは coalesceReads がまとめる）', () => {
    // 型だけを確かめる。呼ぶと DB に問い合わせるので呼ばない
    const _readInBatch = () =>
      // @ts-expect-error select は runBatch に入れられない
      runBatch((tx) => [tx.select().from(users)]);
    expect(_readInBatch).toBeTypeOf('function');
  });
});
