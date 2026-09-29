import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../app.ts';
import { clearTables } from '../lib/db/test-db.ts';

describe('MCP のアクセストークンの検証', () => {
  beforeEach(clearTables);

  it('検証に使う公開鍵の組は、CDN に持たせて関数を起こさずに返す', async () => {
    const res = await app.request('/api/auth/jwks');
    expect(res.status).toBe(200);
    expect(res.headers.get('vercel-cdn-cache-control')).toContain('max-age=86400');
    expect(((await res.json()) as { keys: unknown[] }).keys).toBeInstanceOf(Array);
  });
});
