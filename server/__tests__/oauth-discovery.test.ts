import { describe, expect, it } from 'vitest';
import { app } from '../app.ts';
import { getAuth } from '../lib/auth.ts';

describe('OAuth 2.1 / MCP の探索と保護', () => {
  it('認可サーバーのメタデータをオリジン直下の /.well-known から返す', async () => {
    const res = await app.request('/.well-known/oauth-authorization-server/api/auth');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.issuer).toBe('http://localhost:5173/api/auth');
    expect(body.authorization_endpoint).toBe('http://localhost:5173/api/auth/oauth2/authorize');
    expect(body.token_endpoint).toBe('http://localhost:5173/api/auth/oauth2/token');
    expect(body.code_challenge_methods_supported).toEqual(['S256']);
    // クライアントの識別は Client ID Metadata Documents だけ（Dynamic Client Registration の口は載せない）
    expect(body.client_id_metadata_document_supported).toBe(true);
    expect(body.registration_endpoint).toBeUndefined();
  });

  it('保護リソースのメタデータをオリジン直下の /.well-known から返す', async () => {
    const res = await app.request('/.well-known/oauth-protected-resource/api/mcp');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.resource).toBe('http://localhost:5173/api/mcp');
    expect(body.authorization_servers).toEqual(['http://localhost:5173/api/auth']);
  });

  it('Vercel の rewrite が付けるクエリが混ざっても探索メタデータを返す', async () => {
    const res = await app.request(
      '/.well-known/oauth-protected-resource/api/mcp?path=well-known/oauth-protected-resource/api/mcp',
    );
    expect(res.status).toBe(200);
  });

  it('トークンの無い MCP リクエストは 401 と WWW-Authenticate を返す', async () => {
    const res = await app.request('/api/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('resource_metadata=');
    expect(res.headers.get('www-authenticate')).toContain(
      '/.well-known/oauth-protected-resource/api/mcp',
    );
  });

  it('jwt プラグインの /token（セッション → JWT）は閉じている', async () => {
    expect((await app.request('/api/auth/token')).status).toBe(404);
  });

  it('oauth-provider の口は、MCP の認可フローが使うものだけを HTTP に開ける', async () => {
    // better-auth を上げて口が増えたら、ここで落ちる。使うなら OPEN に足し、使わないなら disabledPaths に足す
    const OPEN = [
      '/oauth2/authorize',
      '/oauth2/consent',
      '/oauth2/continue',
      '/oauth2/token',
      '/oauth2/introspect',
      '/oauth2/revoke',
      '/oauth2/userinfo',
      '/oauth2/end-session',
      '/oauth2/end-session/confirm',
    ];
    // 口の型は口ごとに違うので、ここで使う所だけの形で読む
    type Endpoint = {
      path?: string;
      options: { method: string | string[]; metadata?: { SERVER_ONLY?: boolean } };
    };
    const endpoints = (Object.values((await getAuth()).api) as Endpoint[]).filter(
      (e): e is Endpoint & { path: string } =>
        !!e.path?.startsWith('/oauth2/') && !e.options.metadata?.SERVER_ONLY,
    );
    const open: string[] = [];
    for (const { path, options } of endpoints) {
      const method = [options.method].flat()[0] ?? 'GET';
      const res = await app.request(`/api/auth${path}`, { method });
      if (res.status !== 404) open.push(path);
    }
    expect(open.sort()).toEqual(OPEN.sort());
  });
});
