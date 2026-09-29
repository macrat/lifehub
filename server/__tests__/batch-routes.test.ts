import type { Pool } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../app.ts';
import { db } from '../lib/db/client.ts';
import { clearTables } from '../lib/db/test-db.ts';
import { loginAs } from './login.ts';

/** 束ねた要求の URL（`src/lib/api.ts` の束ねと同じ形） */
function batchUrl(paths: string[]): string {
  return `/api/batch?${paths.map((path) => `r=${encodeURIComponent(path)}`).join('&')}`;
}

type Part = { status: number; body: string };

describe('束ねた GET（/api/batch）', () => {
  beforeEach(clearTables);

  it('中の要求を 1 本ずつ送ったときと同じ結果を、並びどおりに返す', async () => {
    const { cookie } = await loginAs('A');
    const paths = ['/api/me', '/api/lemon/status', '/api/timeline?q=%E3%83%AC%E3%83%A2%E3%83%B3'];
    const res = await app.request(batchUrl(paths), { headers: { cookie } });
    expect(res.status).toBe(200);
    const parts = (await res.json()) as Part[];
    const direct = await Promise.all(
      paths.map(async (path) => {
        const one = await app.request(path, { headers: { cookie } });
        return { status: one.status, body: await one.text() };
      }),
    );
    expect(parts).toEqual(direct);
  });

  it('ログインの検証は束ね全体で 1 回だけ行う', async () => {
    const { cookie } = await loginAs('A');
    const query = vi.spyOn((db as unknown as { $client: Pool }).$client, 'query');
    await app.request(batchUrl(['/api/me', '/api/lemon/status', '/api/expenses/totals']), {
      headers: { cookie },
    });
    const sessionReads = query.mock.calls.filter(([config]) =>
      JSON.stringify(config).includes('from \\"sessions\\"'),
    );
    expect(sessionReads).toHaveLength(1);
    query.mockRestore();
  });

  it('未認証なら全体が 401', async () => {
    const res = await app.request(batchUrl(['/api/me', '/api/lemon/status']));
    expect(res.status).toBe(401);
  });

  it('画面の API 以外と、束ね自身は運ばない', async () => {
    const { cookie } = await loginAs('A');
    const paths = [
      '/api/batch?r=/api/me',
      '/api/../.well-known/oauth-authorization-server',
      '/health',
    ];
    const res = await app.request(batchUrl(paths), { headers: { cookie } });
    const parts = (await res.json()) as Part[];
    expect(parts.map((part) => part.status)).toEqual([400, 400, 400]);
  });

  it('中の要求は元の要求の Cookie を持たない（束ねの検証だけを引き継ぐ）', async () => {
    const { cookie } = await loginAs('A');
    const res = await app.request(batchUrl(['/api/auth/get-session', '/api/me']), {
      headers: { cookie },
    });
    const [session, me] = (await res.json()) as Part[];
    expect(session?.body).toBe('null');
    expect(me?.status).toBe(200);
  });
});
