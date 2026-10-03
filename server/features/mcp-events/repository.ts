import { and, eq, gt, lte } from 'drizzle-orm';
import { db } from '../../lib/db/client.ts';
import { findById as findRowById } from '../../lib/db/query.ts';
import {
  type McpEventSubscriptionRow,
  mcpEventSubscriptions,
  type NewMcpEventSubscriptionRow,
} from './schema.ts';

export function findById(id: string): Promise<McpEventSubscriptionRow | undefined> {
  return findRowById(mcpEventSubscriptions, id);
}

/** 購読を作るか、同じ id の購読を書き換える（購読し直し） */
export async function upsert(row: NewMcpEventSubscriptionRow): Promise<void> {
  const { id: _id, userId: _u, name: _n, url: _url, ...set } = row;
  await db
    .insert(mcpEventSubscriptions)
    .values(row)
    .onConflictDoUpdate({
      target: mcpEventSubscriptions.id,
      set: { ...set, updatedAt: new Date() },
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
