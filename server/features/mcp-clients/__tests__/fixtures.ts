import { and, eq } from 'drizzle-orm';
import { newId } from '../../../../shared/id.ts';
import { db } from '../../../lib/db/client.ts';
import {
  oauthAccessTokens,
  oauthClients,
  oauthConsents,
  oauthRefreshTokens,
} from '../../../lib/db/oauth-schema.ts';
import { mcpEventSubscriptions } from '../../mcp-events/schema.ts';

/** MCP のテストが既定で使う MCP クライアント（OAuth のクライアント ID） */
export const TEST_CLIENT_ID = 'test-client';

/**
 * テスト用: ユーザーが MCP クライアントを許可した同意の行を書き、その id を返す（すでにあればその id）。
 * クライアントの登録が無ければ作る。
 */
export async function grantConsent(
  userId: string,
  clientId = TEST_CLIENT_ID,
  { name = null, at = new Date() }: { name?: string | null; at?: Date } = {},
): Promise<string> {
  await db
    .insert(oauthClients)
    .values({ id: newId(), clientId, name, redirectUris: [] })
    .onConflictDoNothing();
  const [existing] = await db
    .select({ id: oauthConsents.id })
    .from(oauthConsents)
    .where(and(eq(oauthConsents.userId, userId), eq(oauthConsents.clientId, clientId)));
  if (existing) return existing.id;
  const id = newId();
  await db
    .insert(oauthConsents)
    .values({ id, clientId, userId, scopes: [], createdAt: at, updatedAt: at });
  return id;
}

/**
 * テスト用: ユーザーが MCP クライアントを許可した状態（better-auth が認可フローで書く同意とトークンの行と、
 * そのクライアントが張った MCP Events の購読）を直接書き、同意の id を返す。subscribe: false なら購読は書かない。
 */
export async function authorizeClient(
  userId: string,
  clientId: string,
  options: { name?: string | null; at?: Date; subscribe?: boolean } = {},
): Promise<string> {
  const at = options.at ?? new Date();
  const consentId = await grantConsent(userId, clientId, options);
  const expiresAt = new Date(at.getTime() + 60 * 60 * 1000);
  const token = { clientId, userId, expiresAt, createdAt: at, scopes: ['offline_access'] };
  const refreshId = newId();
  await db.insert(oauthRefreshTokens).values({ ...token, id: refreshId, token: newId() });
  await db.insert(oauthAccessTokens).values({ ...token, id: newId(), token: newId(), refreshId });
  if (options.subscribe === false) return consentId;
  await db.insert(mcpEventSubscriptions).values({
    id: newId(),
    userId,
    consentId,
    name: 'memo.changed',
    url: 'https://receiver.example.com/hook',
    secret: 'whsec_test',
    expiresAt,
  });
  return consentId;
}
