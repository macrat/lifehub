import { createHash, createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { newId } from '../../shared/id.ts';
import { app } from '../app.ts';
import { truncateAll } from '../lib/test-db.ts';

const base64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

/**
 * QStash と同じ形の署名（HS256 の JWT。iss は Upstash、body は本文の SHA-256）を
 * server/test-setup.ts の署名鍵で作る。
 */
function sign(body: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iss: 'Upstash',
      sub: 'http://localhost/api/qstash/notifications',
      iat: now,
      nbf: now,
      exp: now + 300,
      body: createHash('sha256').update(body).digest('base64url'),
    }),
  );
  const signature = createHmac('sha256', process.env.QSTASH_CURRENT_SIGNING_KEY ?? '')
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function post(body: string, signature?: string) {
  return app.request('/api/qstash/notifications', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(signature ? { 'upstash-signature': signature } : {}),
    },
    body,
  });
}

describe('QStash の配信コールバック', () => {
  beforeEach(truncateAll);

  it('署名が無ければどれも 401', async () => {
    for (const path of ['/api/qstash/notifications', '/api/qstash/unknown']) {
      const res = await app.request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: 'task:x' }),
      });
      expect(res.status).toBe(401);
    }
  });

  it('本文を書き換えると署名が合わず 401', async () => {
    const res = await post(JSON.stringify({ key: 'b' }), sign(JSON.stringify({ key: 'a' })));
    expect(res.status).toBe(401);
  });

  it('署名が正しくても本文の形が違えば 400', async () => {
    const body = JSON.stringify({ key: 'task:x' });
    const res = await post(body, sign(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty('message');
  });

  it('署名を確かめた後の本文を読んで配信する（無くなった予定は送らない）', async () => {
    const body = JSON.stringify({
      key: 'event:test',
      ref: {
        id: newId(),
        occurrenceStart: null,
        edge: 'start',
        at: '2026-09-20T00:00:00.000Z',
        userId: null,
      },
    });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: 'stale' });
  });
});
