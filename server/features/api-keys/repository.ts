import { asc, eq } from 'drizzle-orm';
import { db } from '../../lib/db/client.ts';
import { deleteById } from '../../lib/db/query.ts';
import { type ApiKeyRow, apiKeys } from './schema.ts';

export async function findByUser(userId: string): Promise<ApiKeyRow[]> {
  return db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(asc(apiKeys.createdAt));
}

export async function insert(values: {
  id: string;
  userId: string;
  name: string;
  keyHash: string;
  createdAt: Date;
}): Promise<void> {
  await db.insert(apiKeys).values(values);
}

/** 失効。持ち主のものだけを消し、消せたかどうかを返す */
export async function remove(id: string, userId: string): Promise<boolean> {
  return (await deleteById(apiKeys, id, eq(apiKeys.userId, userId))) !== undefined;
}

/**
 * ハッシュに対応する行の最終使用日時を更新し、持ち主と名前を返す（無ければ undefined）。
 * 照合と記録を 1 文にまとめ、受け付け 1 回あたりの往復を増やさない。
 */
export async function touchByHash(
  keyHash: string,
  now: Date,
): Promise<{ userId: string; name: string } | undefined> {
  const touched = await db
    .update(apiKeys)
    .set({ lastUsedAt: now })
    .where(eq(apiKeys.keyHash, keyHash))
    .returning({ userId: apiKeys.userId, name: apiKeys.name });
  return touched[0];
}
