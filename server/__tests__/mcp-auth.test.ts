import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../app.ts';
import { authorizeClient } from '../features/mcp-clients/__tests__/fixtures.ts';
import { listClients, revokeClient } from '../features/mcp-clients/service.ts';
import { getAuth, MCP_RESOURCE } from '../lib/auth.ts';
import { clearTables, resetUsers } from '../lib/db/test-db.ts';

const CLIENT = 'https://claude.example.com/oauth/client.json';

/** oauth-provider が MCP クライアントに渡すのと同じ形のアクセストークン（JWT）を、LifeHub の鍵で署名して作る */
async function accessTokenFor(userId: string): Promise<string> {
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
      },
    },
  });
  return token;
}

function listTools(token: string) {
  return app.request('/api/mcp', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
}

describe('MCP のアクセストークンの検証', () => {
  beforeEach(clearTables);
  afterEach(() => vi.restoreAllMocks());

  it('検証に使う公開鍵の組は、CDN に持たせて関数を起こさずに返す', async () => {
    const res = await app.request('/api/auth/jwks');
    expect(res.status).toBe(200);
    expect(res.headers.get('vercel-cdn-cache-control')).toContain('max-age=86400');
    expect(((await res.json()) as { keys: unknown[] }).keys).toBeInstanceOf(Array);
  });

  it('期限内のトークンでも、許可を失効したクライアントからの要求は 401 と WWW-Authenticate で断る', async () => {
    // requireMcpAuth が公開鍵を取りに行く先（このアプリ自身）へ、ネットワークを通さずに送る
    const fetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) =>
      String(input instanceof Request ? input.url : input).endsWith('/api/auth/jwks')
        ? Promise.resolve(app.request('/api/auth/jwks'))
        : fetch(input, init),
    );
    const { userId } = await resetUsers();
    await authorizeClient(userId, CLIENT);
    const token = await accessTokenFor(userId);
    expect((await listTools(token)).status).toBe(200);

    const [client] = await listClients(userId);
    await revokeClient(client?.id ?? '', userId);

    const res = await listTools(token);
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain(
      '/.well-known/oauth-protected-resource/api/mcp',
    );
  });
});
