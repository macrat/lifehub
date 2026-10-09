import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../app.ts';
import { createFeed } from '../features/calendar-feeds/service.ts';
import { clearTables, createTestUser } from '../lib/db/test-db.ts';

/**
 * `/api/calendar` の下のログインの要らない ics の配信（`<token>.ics`）と、ログインが要る配信 URL の管理
 * （画面の API の `calendarFeeds`）。取り違えるとカレンダー全体が誰にでも読めるか、
 * 逆に購読できなくなるので、入口ごとの扱いをここで確かめる。
 */
describe('カレンダー配信のルート', () => {
  beforeEach(clearTables);

  it('ics はログイン無しで読め、配信 URL の管理はログインが要る', async () => {
    const userId = await createTestUser('A');
    const { secret: url } = await createFeed({ name: 'スマホ', participantIds: [userId] }, userId);

    const ics = await app.request(new URL(url).pathname);
    expect(ics.status).toBe(200);
    expect(ics.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
    expect(await ics.text()).toContain('BEGIN:VCALENDAR');
  });

  it('知らないトークンは 404', async () => {
    expect((await app.request('/api/calendar/unknown-token.ics')).status).toBe(404);
  });
});
