import { and, asc, eq, inArray } from 'drizzle-orm';
import { db, runBatch } from '../../lib/db/client.ts';
import {
  oauthAccessTokens,
  oauthClients,
  oauthConsents,
  oauthRefreshTokens,
} from '../../lib/db/oauth-schema.ts';
import { mcpEventSubscriptions } from '../mcp-events/schema.ts';

export type ConnectionRow = {
  id: string;
  clientId: string;
  name: string | null;
  updatedAt: Date;
};

/** そのユーザーが許可した MCP クライアント（同意 1 件に 1 行。許可した順） */
export async function findByUser(userId: string): Promise<ConnectionRow[]> {
  return db
    .select({
      id: oauthConsents.id,
      clientId: oauthConsents.clientId,
      name: oauthClients.name,
      updatedAt: oauthConsents.updatedAt,
    })
    .from(oauthConsents)
    .innerJoin(oauthClients, eq(oauthClients.clientId, oauthConsents.clientId))
    .where(eq(oauthConsents.userId, userId))
    .orderBy(asc(oauthConsents.createdAt));
}

/** そのユーザーがそのクライアントを許可しているか */
export async function exists(userId: string, clientId: string): Promise<boolean> {
  const rows = await db
    .select({ id: oauthConsents.id })
    .from(oauthConsents)
    .where(and(eq(oauthConsents.userId, userId), eq(oauthConsents.clientId, clientId)))
    .limit(1);
  return rows.length > 0;
}

/**
 * 同意 id のクライアントについて、そのユーザーの同意・トークン・MCP Events の購読を消し、消せたかどうかを返す。
 * 1 回の原子的な操作で行う（同意だけ消えてトークンが残る、を起こさない）。対象のクライアントは同意から
 * 副問い合わせで引くので、読む往復を別に挟まない。同意はその副問い合わせが読むので最後に消す。
 */
export async function remove(id: string, userId: string): Promise<boolean> {
  const results = await runBatch((tx) => {
    const clientIds = tx
      .select({ clientId: oauthConsents.clientId })
      .from(oauthConsents)
      .where(and(eq(oauthConsents.id, id), eq(oauthConsents.userId, userId)));
    return [
      tx
        .delete(oauthAccessTokens)
        .where(
          and(eq(oauthAccessTokens.userId, userId), inArray(oauthAccessTokens.clientId, clientIds)),
        ),
      tx
        .delete(oauthRefreshTokens)
        .where(
          and(
            eq(oauthRefreshTokens.userId, userId),
            inArray(oauthRefreshTokens.clientId, clientIds),
          ),
        ),
      tx
        .delete(mcpEventSubscriptions)
        .where(
          and(
            eq(mcpEventSubscriptions.userId, userId),
            inArray(mcpEventSubscriptions.clientId, clientIds),
          ),
        ),
      tx
        .delete(oauthConsents)
        .where(and(eq(oauthConsents.userId, userId), inArray(oauthConsents.clientId, clientIds)))
        .returning({ id: oauthConsents.id }),
    ];
  });
  return results[3].length > 0;
}
