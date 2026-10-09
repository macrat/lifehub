import { and, eq } from 'drizzle-orm';
import { newId } from '../../../../shared/id.ts';
import { MCP_RESOURCE } from '../../../lib/auth.ts';
import { db } from '../../../lib/db/client.ts';
import {
  oauthAccessTokens,
  oauthClientResources,
  oauthClients,
  oauthConsents,
  oauthRefreshTokens,
  oauthResources,
} from '../../../lib/db/oauth-schema.ts';
import { hashSecret, newSecret } from '../../../lib/secret.ts';
import { mcpEventSubscriptions } from '../../mcp-events/schema.ts';

/** MCP のテストが既定で使う MCP クライアント（OAuth のクライアント ID） */
export const TEST_CLIENT_ID = 'test-client';

/**
 * テスト用: ユーザーが MCP クライアントを許可した同意の行を書き、その id を返す（すでにあればその id）。
 * クライアントの登録が無ければ、MCP クライアントと同じ公開クライアント（PKCE とリフレッシュトークンで
 * 認可を受ける）として作る。
 */
export async function grantConsent(
  userId: string,
  clientId = TEST_CLIENT_ID,
  { name = null, at = new Date() }: { name?: string | null; at?: Date } = {},
): Promise<string> {
  await db
    .insert(oauthClients)
    .values({
      id: newId(),
      clientId,
      name,
      redirectUris: [],
      tokenEndpointAuthMethod: 'none',
      grantTypes: ['authorization_code', 'refresh_token'],
      responseTypes: ['code'],
      scopes: ['offline_access'],
    })
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
 * テスト用: ユーザーが MCP クライアントを許可した状態（better-auth が認可フローで書く、MCP を宛先にした
 * クライアントの登録・同意・トークンの行と、そのクライアントが張った MCP Events の購読）を直接書く。
 * 同意の id と、トークンエンドポイントでそのまま使えるリフレッシュトークンを返す。
 */
export async function authorizeClient(
  userId: string,
  clientId: string,
  options: { name?: string | null; at?: Date } = {},
): Promise<{ consentId: string; refreshToken: string }> {
  const at = options.at ?? new Date();
  const consentId = await grantConsent(userId, clientId, options);
  // MCP の宛先は better-auth が起動時に書くが、テストの前に表を空けるので書き直す
  await db
    .insert(oauthResources)
    .values({ id: newId(), identifier: MCP_RESOURCE, name: 'LifeHub' })
    .onConflictDoNothing();
  await db
    .insert(oauthClientResources)
    .values({ id: newId(), clientId, resourceId: MCP_RESOURCE })
    .onConflictDoNothing();
  const expiresAt = new Date(at.getTime() + 60 * 60 * 1000);
  const token = { clientId, userId, expiresAt, createdAt: at, scopes: ['offline_access'] };
  const refreshId = newId();
  const refreshToken = newSecret();
  await db.insert(oauthRefreshTokens).values({
    ...token,
    id: refreshId,
    // oauth-provider が保存するのと同じ形（ハッシュ）
    token: hashSecret(refreshToken),
    resources: [MCP_RESOURCE],
  });
  await db.insert(oauthAccessTokens).values({ ...token, id: newId(), token: newId(), refreshId });
  await db.insert(mcpEventSubscriptions).values({
    id: newId(),
    userId,
    consentId,
    name: 'memo.changed',
    url: 'https://receiver.example.com/hook',
    secret: 'whsec_test',
    expiresAt,
  });
  return { consentId, refreshToken };
}
