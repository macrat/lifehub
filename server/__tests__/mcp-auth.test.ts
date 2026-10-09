import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newId } from '../../shared/id.ts';
import { app } from '../app.ts';
import { authorizeClient } from '../features/mcp-clients/__tests__/fixtures.ts';
import { revokeClient } from '../features/mcp-clients/service.ts';
import { mcpEventSubscriptions } from '../features/mcp-events/schema.ts';
import { MCP_RESOURCE } from '../lib/auth.ts';
import { db } from '../lib/db/client.ts';
import {
  oauthClientResources,
  oauthClients,
  oauthRefreshTokens,
  oauthResources,
} from '../lib/db/oauth-schema.ts';
import { resetUsers } from '../lib/db/test-db.ts';
import { hashSecret, newSecret } from '../lib/secret.ts';

const CLIENT = 'https://claude.example.com/oauth/client.json';

function mcpRequest(token: string, method: string, params?: Record<string, unknown>) {
  return app.request('/api/mcp', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
}

/**
 * MCP クライアントがリフレッシュトークンでアクセストークンを取り直す（トークンの期限ごとにする要求）。
 * リフレッシュトークンは oauth-provider が保存するのと同じ形（ハッシュ）で書いておく
 */
async function refresh(userId: string) {
  const refreshToken = newSecret();
  const now = new Date();
  await db.insert(oauthRefreshTokens).values({
    id: newId(),
    token: hashSecret(refreshToken),
    clientId: CLIENT,
    userId,
    resources: [MCP_RESOURCE],
    scopes: ['offline_access'],
    createdAt: now,
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
  });
  return app.request('/api/auth/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CLIENT,
      refresh_token: refreshToken,
      resource: MCP_RESOURCE,
    }).toString(),
  });
}

/** リフレッシュでアクセストークンを発行させ、その JWT を返す */
async function issueAccessToken(userId: string): Promise<string> {
  const res = await refresh(userId);
  expect(res.status).toBe(200);
  return ((await res.json()) as { access_token: string }).access_token;
}

describe('MCP のアクセストークン', () => {
  let userId: string;
  beforeEach(async () => {
    ({ userId } = await resetUsers());
    // 公開クライアント（PKCE とリフレッシュトークンだけで認可を受ける MCP クライアント）として、MCP を宛先に登録する。
    // MCP の宛先は better-auth が起動時に書くが、テストの前に表を空けるので書き直す
    await db.insert(oauthClients).values({
      id: newId(),
      clientId: CLIENT,
      redirectUris: ['https://claude.example.com/callback'],
      tokenEndpointAuthMethod: 'none',
      grantTypes: ['authorization_code', 'refresh_token'],
      responseTypes: ['code'],
      scopes: ['offline_access'],
    });
    await db
      .insert(oauthResources)
      .values({ id: newId(), identifier: MCP_RESOURCE, name: 'LifeHub' });
    await db
      .insert(oauthClientResources)
      .values({ id: newId(), clientId: CLIENT, resourceId: MCP_RESOURCE });
    // requireMcpAuth が公開鍵を取りに行く先（このアプリ自身）へ、ネットワークを通さずに送る
    const fetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) =>
      String(input instanceof Request ? input.url : input).endsWith('/api/auth/jwks')
        ? Promise.resolve(app.request('/api/auth/jwks'))
        : fetch(input, init),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('検証に使う公開鍵の組は、CDN に持たせて関数を起こさずに返す', async () => {
    const res = await app.request('/api/auth/jwks');
    expect(res.status).toBe(200);
    expect(res.headers.get('vercel-cdn-cache-control')).toContain('max-age=86400');
    expect(((await res.json()) as { keys: unknown[] }).keys).toBeInstanceOf(Array);
  });

  it('失効した許可のトークンは、同じ秒のうちに許可し直しても 401 で断って購読も残さず、新しい許可のトークンは通す', async () => {
    // 発行・失効・許可し直しを、時計を止めて同じ時刻に起こす
    vi.useFakeTimers({ now: new Date(), toFake: ['Date'] });
    const revoked = await authorizeClient(userId, CLIENT);
    const oldToken = await issueAccessToken(userId);
    await revokeClient(revoked, userId);
    await authorizeClient(userId, CLIENT);
    const newToken = await issueAccessToken(userId);
    vi.useRealTimers();

    const res = await mcpRequest(oldToken, 'tools/list');
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain(
      '/.well-known/oauth-protected-resource/api/mcp',
    );
    const url = 'https://attacker.example.com/hook';
    const subscribe = await mcpRequest(oldToken, 'events/subscribe', {
      name: 'memo.changed',
      delivery: { mode: 'webhook', url, secret: 'whsec_x' },
    });
    expect(subscribe.status).toBe(401);
    expect((await db.select().from(mcpEventSubscriptions)).map((row) => row.url)).not.toContain(
      url,
    );
    expect((await mcpRequest(newToken, 'tools/list')).status).toBe(200);
  });

  it('許可が無ければ（失効した後に残ったリフレッシュトークンなど）、アクセストークンを発行しない', async () => {
    const res = await refresh(userId);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_grant' });
  });
});
