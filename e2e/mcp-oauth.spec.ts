import { createHash, randomBytes } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test } from '@playwright/test';
import { SIGNED_OUT } from './auth.ts';
import { E2E_USER } from './global-setup.ts';

const BASE = 'http://localhost:3000';

function base64url(buffer: Buffer): string {
  return buffer.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/**
 * MCP クライアントと同じ手順: Dynamic Client Registration → 認可（ログイン → 同意）→ PKCE でトークン → MCP 呼び出し。
 * 認可の途中でログインを求められ、ログインすると認可へ戻るところまで通すので、ログインしていない状態から始める。
 */
test.use({ storageState: SIGNED_OUT });

test('OAuth 2.1 で認可した MCP クライアントがツールを呼べる', async ({ page, request }) => {
  // http のループバックへのリダイレクトは native クライアント（Claude Desktop 等と同じ）にだけ許される
  const redirectUri = 'http://127.0.0.1:3000/oauth-callback';
  const registered = await request.post('/api/auth/oauth2/register', {
    data: {
      client_name: 'E2E MCP Client',
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: 'none',
      application_type: 'native',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    },
  });
  expect(registered.ok(), await registered.text()).toBe(true);
  const { client_id: clientId } = (await registered.json()) as { client_id: string };

  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  const state = base64url(randomBytes(8));
  const authorize = new URL('/api/auth/oauth2/authorize', BASE);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('redirect_uri', redirectUri);
  authorize.searchParams.set('scope', 'openid profile');
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('code_challenge', challenge);
  authorize.searchParams.set('code_challenge_method', 'S256');
  authorize.searchParams.set('resource', `${BASE}/api/mcp`);

  await page.goto(authorize.toString());
  await expect(page).toHaveURL(/\/login\?/);
  await page.getByLabel('メールアドレス').fill(E2E_USER.email);
  await page.getByLabel('パスワード').fill(E2E_USER.password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page).toHaveURL(/\/consent\?/);
  await expect(page.getByRole('heading', { name: 'アクセスの許可' })).toBeVisible();
  await page.getByRole('button', { name: '許可' }).click();
  await page.waitForURL(/\/oauth-callback\?/);
  const callback = new URL(page.url());
  expect(callback.searchParams.get('state')).toBe(state);
  const code = callback.searchParams.get('code');
  expect(code).toBeTruthy();

  const token = await request.post('/api/auth/oauth2/token', {
    form: {
      grant_type: 'authorization_code',
      code: code ?? '',
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
      resource: `${BASE}/api/mcp`,
    },
  });
  expect(token.ok(), await token.text()).toBe(true);
  const { access_token: accessToken } = (await token.json()) as { access_token: string };

  // 2026-07-28 の MCP（MCP Events を使うクライアント）と 2025 年版の両方で、本番と同じ口を通して呼べる
  for (const mode of [{ pin: '2026-07-28' } as const, 'legacy' as const]) {
    const client = new Client({ name: 'e2e', version: '0.0.0' }, { versionNegotiation: { mode } });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${BASE}/api/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${accessToken}` } },
      }),
    );
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain('read_timeline');
    const overview = await client.callTool({ name: 'get_overview', arguments: {} });
    const [content] = overview.content as { text?: string }[];
    const { users } = JSON.parse(content?.text ?? '{}') as {
      users: { name: string; isMe: boolean }[];
    };
    expect(users.find((u) => u.isMe)?.name).toBe(E2E_USER.name);
    await client.close();
  }

  // トークン無しは 401 と RFC 9728 の案内
  const anonymous = await request.post('/api/mcp', {
    headers: { accept: 'application/json, text/event-stream', 'content-type': 'application/json' },
    data: { jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} },
  });
  expect(anonymous.status()).toBe(401);
  expect(anonymous.headers()['www-authenticate']).toContain(
    '/.well-known/oauth-protected-resource/api/mcp',
  );
  const metadata = await request.get('/.well-known/oauth-protected-resource/api/mcp');
  expect(metadata.ok()).toBe(true);
});
