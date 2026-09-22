import { describe, expect, it } from 'vitest';
import { app } from '../app.ts';

describe('OAuth 2.1 / MCP の探索と保護', () => {
  it('認可サーバーのメタデータをオリジン直下の /.well-known から返す', async () => {
    const res = await app.request('/.well-known/oauth-authorization-server/api/auth');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.issuer).toBe('http://localhost:5173/api/auth');
    expect(body.authorization_endpoint).toBe('http://localhost:5173/api/auth/oauth2/authorize');
    expect(body.token_endpoint).toBe('http://localhost:5173/api/auth/oauth2/token');
    expect(body.code_challenge_methods_supported).toEqual(['S256']);
    expect(body.registration_endpoint).toBe('http://localhost:5173/api/auth/oauth2/register');
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
});
