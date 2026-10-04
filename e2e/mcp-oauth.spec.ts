import { createHash, randomBytes } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { SIGNED_OUT } from './auth.ts';
import { expect, test } from './test.ts';
import { E2E_USER } from './users.ts';

function base64url(buffer: Buffer): string {
  return buffer.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/**
 * MCP クライアントと同じ手順: 認可（ログイン → 同意）→ PKCE でトークン → MCP 呼び出し。
 * 認可の途中でログインを求められ、ログインすると認可へ戻るところまで通すので、ログインしていない状態から始める。
 * クライアントの登録は、本番で受け付ける Client ID Metadata Documents だと LifeHub が公開の https の URL から
 * メタデータ文書を取りに行くので、E2E の中では用意できない。代わりにサーバー内部から better-auth の
 * `createOAuthClient` で作る（HTTP の口は閉じている）。
 * 登録した後の認可・トークン・MCP は登録の仕方に依らず同じ。
 */
test.use({ storageState: SIGNED_OUT });

test('OAuth 2.1 で認可した MCP クライアントがツールを呼べる', async ({
  page,
  request,
  server,
  signedIn,
}) => {
  const BASE = server.url;
  // http のループバックへのリダイレクトは native クライアント（Claude Desktop 等と同じ）にだけ許される
  const redirectUri = `http://127.0.0.1:${server.port}/oauth-callback`;
  // 作るのは E2E ユーザー（ワーカーのログイン状態の Cookie で名乗る。`test.ts`）。サーバーのコードはこのテストでだけ読み込む
  const { cookies } = signedIn;
  const { getAuth } = await import('../server/lib/auth.ts');
  const { client_id: clientId } = await (await getAuth()).api.createOAuthClient({
    headers: new Headers({
      cookie: cookies.map(({ name, value }) => `${name}=${value}`).join('; '),
    }),
    body: {
      client_name: 'E2E MCP Client',
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: 'none',
      application_type: 'native',
    },
  });

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
