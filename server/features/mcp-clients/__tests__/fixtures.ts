import { newId } from '../../../../shared/id.ts';
import { db } from '../../../lib/db/client.ts';
import {
  oauthAccessTokens,
  oauthClients,
  oauthConsents,
  oauthRefreshTokens,
} from '../../../lib/db/oauth-schema.ts';
import { mcpEventSubscriptions } from '../../mcp-events/schema.ts';

/**
 * テスト用: ユーザーが MCP クライアントを許可した状態（better-auth が認可フローで書く行と、
 * そのクライアントが張った MCP Events の購読）を直接書く。クライアントの登録が無ければ作る。
 */
export async function authorizeClient(
  userId: string,
  clientId: string,
  { name = null, at = new Date() }: { name?: string | null; at?: Date } = {},
): Promise<void> {
  const expiresAt = new Date(at.getTime() + 60 * 60 * 1000);
  await db
    .insert(oauthClients)
    .values({ id: newId(), clientId, name, redirectUris: [] })
    .onConflictDoNothing();
  await db
    .insert(oauthConsents)
    .values({ id: newId(), clientId, userId, scopes: [], createdAt: at, updatedAt: at });
  const token = { clientId, userId, expiresAt, createdAt: at, scopes: ['offline_access'] };
  const refreshId = newId();
  await db.insert(oauthRefreshTokens).values({ ...token, id: refreshId, token: newId() });
  await db.insert(oauthAccessTokens).values({ ...token, id: newId(), token: newId(), refreshId });
  await db.insert(mcpEventSubscriptions).values({
    id: newId(),
    userId,
    clientId,
    name: 'memo.changed',
    url: 'https://receiver.example.com/hook',
    secret: 'whsec_test',
    expiresAt,
  });
}
