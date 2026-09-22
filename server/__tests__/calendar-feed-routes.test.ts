import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../app.ts';
import { createFeed } from '../features/calendar-feeds/service.ts';
import { createUser } from '../features/users/service.ts';
import { truncateAll } from '../lib/test-db.ts';

/**
 * `/api/calendar` の下には、ログインが要る配信 URL の管理（`feeds`）と、ログインの要らない
 * ics の配信（`<token>.ics`）が同居する。取り違えるとカレンダー全体が誰にでも読めるか、
 * 逆に購読できなくなるので、入口ごとの扱いをここで確かめる。
 */
describe('カレンダー配信のルート', () => {
  beforeEach(truncateAll);

  it('ics はログイン無しで読め、配信 URL の管理はログインが要る', async () => {
    const user = await createUser({
      email: 'a@example.com',
      name: 'A',
      password: 'password-123456',
    });
    const feed = await createFeed({ name: 'スマホ' }, user.id);

    const ics = await app.request(new URL(feed.url).pathname);
    expect(ics.status).toBe(200);
    expect(ics.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
    expect(await ics.text()).toContain('BEGIN:VCALENDAR');

    expect((await app.request('/api/calendar/feeds')).status).toBe(401);
  });

  it('知らないトークンは 404', async () => {
    expect((await app.request('/api/calendar/unknown-token.ics')).status).toBe(404);
  });
});
