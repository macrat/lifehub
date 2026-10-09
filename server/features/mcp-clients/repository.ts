import { and, asc, eq, inArray } from 'drizzle-orm';
import { db, runBatch } from '../../lib/db/client.ts';
import {
  oauthAccessTokens,
  oauthClients,
  oauthConsents,
  oauthRefreshTokens,
} from '../../lib/db/oauth-schema.ts';

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

/** その id の同意が、そのユーザーのそのクライアントへの許可として今もあるか */
export async function existsConsent(
  id: string,
  userId: string,
  clientId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: oauthConsents.id })
    .from(oauthConsents)
    .where(
      and(
        eq(oauthConsents.id, id),
        eq(oauthConsents.userId, userId),
        eq(oauthConsents.clientId, clientId),
      ),
    );
  return !!row;
}

/**
 * 同意 id のクライアントについて、そのユーザーの同意とトークンを消し、消せたかどうかを返す。
 * MCP Events の購読は同意への外部キーで一緒に消える。
 * 1 回の原子的な操作で行う（同意だけ消えてトークンが残る、を起こさない）。対象のクライアントは同意から
 * 副問い合わせで引くので、読む往復を別に挟まない。同意はその副問い合わせが読むので最後に消す。
 */
export async function remove(id: string, userId: string): Promise<boolean> {
  const [, , consents] = await runBatch((tx) => {
    const clientIds = tx
      .select({ clientId: oauthConsents.clientId })
      .from(oauthConsents)
      .where(and(eq(oauthConsents.id, id), eq(oauthConsents.userId, userId)));
    const owned = (
      table: typeof oauthAccessTokens | typeof oauthRefreshTokens | typeof oauthConsents,
    ) => and(eq(table.userId, userId), inArray(table.clientId, clientIds));
    return [
      tx.delete(oauthAccessTokens).where(owned(oauthAccessTokens)),
      tx.delete(oauthRefreshTokens).where(owned(oauthRefreshTokens)),
      tx.delete(oauthConsents).where(owned(oauthConsents)).returning({ id: oauthConsents.id }),
    ];
  });
  return consents.length > 0;
}
