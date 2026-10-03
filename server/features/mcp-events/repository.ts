import { and, asc, eq, gt, lte } from 'drizzle-orm';
import { db } from '../../lib/db/client.ts';
import { findById as findRowById } from '../../lib/db/query.ts';
import type { Person } from '../../lib/mcp/types.ts';
import { users } from '../users/schema.ts';
import {
  type McpEventSubscriptionRow,
  mcpEventSubscriptions,
  type NewMcpEventSubscriptionRow,
} from './schema.ts';

export function findById(id: string): Promise<McpEventSubscriptionRow | undefined> {
  return findRowById(mcpEventSubscriptions, id);
}

/**
 * 購読を作るか、同じ id の購読の鍵と期限を書き換える（購読し直し）。
 * 購読の素性（id・人・イベント名・URL）は id から決まるので書き換えない
 */
export async function upsert(
  identity: Pick<NewMcpEventSubscriptionRow, 'id' | 'userId' | 'name' | 'url'>,
  values: Pick<
    NewMcpEventSubscriptionRow,
    'secret' | 'expiresAt' | 'previousSecret' | 'previousSecretExpiresAt'
  >,
): Promise<void> {
  await db
    .insert(mcpEventSubscriptions)
    .values({ ...identity, ...values })
    .onConflictDoUpdate({
      target: mcpEventSubscriptions.id,
      set: { ...values, updatedAt: new Date() },
    });
}

export async function remove(id: string): Promise<void> {
  await db.delete(mcpEventSubscriptions).where(eq(mcpEventSubscriptions.id, id));
}

/** 期限内の、そのイベントの購読 */
export async function findActive(name: string, now: Date): Promise<McpEventSubscriptionRow[]> {
  return db
    .select()
    .from(mcpEventSubscriptions)
    .where(and(eq(mcpEventSubscriptions.name, name), gt(mcpEventSubscriptions.expiresAt, now)));
}

export async function removeExpired(now: Date): Promise<void> {
  await db.delete(mcpEventSubscriptions).where(lte(mcpEventSubscriptions.expiresAt, now));
}

/**
 * ユーザーの ID と名前（登録順。users の service の `listPeople` と同じもの）。届けるエントリーと書いた人を名前で出すのに使う。
 * WHY NOT users の service から読む: users の service は通知を予約し直す（notifications の service を呼ぶ）。
 * notifications の service は通知を配るときに mcp-events の service（`publishReminder`）を呼ぶので、users の service を読むと
 * import が一巡する（biome の noImportCycles が禁じる）。
 */
export async function findPeople(): Promise<Person[]> {
  return db.select({ id: users.id, name: users.name }).from(users).orderBy(asc(users.createdAt));
}
