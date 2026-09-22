import { beforeEach, describe, expect, it } from 'vitest';
import {
  createEventSchema,
  deleteEventSchema,
  updateEventSchema,
} from '../../../../shared/validation/events.ts';
import { NotFoundError } from '../../../lib/errors.ts';
import { truncateAll } from '../../../lib/test-db.ts';
import { createEvent, deleteEvent, updateEvent } from '../../events/service.ts';
import { createUser } from '../../users/service.ts';
import { createFeed, listFeeds, renderIcs, revokeFeed, updateFeed } from '../service.ts';

const jst = (s: string) => new Date(`${s}+09:00`);
const iso = (s: string) => jst(s).toISOString();

// 「今日」を 2026-09-14（月）の正午に固定する
const now = jst('2026-09-14T12:00:00');

/** 発行した URL から ics を取り出す（配信の入口はトークンで引くため、URL から抜き出して渡す） */
const tokenOf = (url: string) => url.slice(url.lastIndexOf('/') + 1, -'.ics'.length);
const icsOf = (feed: { url: string }) => renderIcs(tokenOf(feed.url), now);

/** ics の 1 行を取り出す。折り返し（行頭 1 文字の空白）は畳んでから探す */
const lines = (ics: string) => ics.replace(/\r\n /g, '').split('\r\n');
const valuesOf = (ics: string, name: string) =>
  lines(ics)
    .filter((line) => line.startsWith(`${name}:`) || line.startsWith(`${name};`))
    .map((line) => line.slice(line.indexOf(':') + 1));

let userId: string;
/** 相手のユーザー。参加者で絞るテストが「自分ではない誰か」として使う */
let otherId: string;

describe('calendar-feeds service', () => {
  beforeEach(async () => {
    await truncateAll();
    userId = (await createUser({ email: 'a@example.com', name: 'A', password: 'password-123456' }))
      .id;
    otherId = (await createUser({ email: 'b@example.com', name: 'B', password: 'password-123456' }))
      .id;
  });

  it('発行した URL で予定を配信し、最後に読まれた日時を記録する', async () => {
    await createEvent(
      createEventSchema.parse({
        kind: 'event',
        title: '打ち合わせ, 大事',
        startsAt: iso('2026-09-15T09:00:00'),
        endsAt: iso('2026-09-15T10:00:00'),
        location: '会議室',
        note: 'メモ',
        participantIds: [userId],
      }),
      userId,
    );
    const feed = await createFeed({ name: 'スマホ', participantIds: [userId] }, userId);
    expect(feed.url).toMatch(/\/api\/calendar\/[\w-]+\.ics$/);
    expect(feed.lastAccessedAt).toBeNull();

    const ics = await icsOf(feed);
    expect(lines(ics)[0]).toBe('BEGIN:VCALENDAR');
    expect(valuesOf(ics, 'DTSTART')).toEqual(['20260915T000000Z']);
    expect(valuesOf(ics, 'DTEND')).toEqual(['20260915T010000Z']);
    // 区切り記号は iCalendar のエスケープで出る（自前の組み立てに頼らない）
    expect(valuesOf(ics, 'SUMMARY')).toEqual(['打ち合わせ\\, 大事']);
    expect(valuesOf(ics, 'LOCATION')).toEqual(['会議室']);
    expect(valuesOf(ics, 'DESCRIPTION')).toEqual(['メモ']);

    const [after] = await listFeeds(userId);
    expect(after?.lastAccessedAt).toBe(now.toISOString());
  });

  it('終日の予定は JST の暦日の DATE 値になる（終端は排他的なまま）', async () => {
    await createEvent(
      createEventSchema.parse({
        kind: 'event',
        title: '旅行',
        allDay: true,
        startsAt: iso('2026-09-20T00:00:00'),
        endsAt: iso('2026-09-21T00:00:00'),
        participantIds: [userId],
      }),
      userId,
    );
    const feed = await createFeed({ name: 'スマホ', participantIds: [userId] }, userId);
    const ics = await icsOf(feed);
    expect(lines(ics)).toContain('DTSTART;VALUE=DATE:20260920');
    expect(lines(ics)).toContain('DTEND;VALUE=DATE:20260922');
  });

  it('繰り返しは回ごとの VEVENT になり、取り消した回は出ない', async () => {
    const weekly = await createEvent(
      createEventSchema.parse({
        kind: 'event',
        title: '週次ミーティング',
        startsAt: iso('2026-09-07T09:00:00'),
        endsAt: iso('2026-09-07T10:00:00'),
        participantIds: [userId],
        rrule: 'FREQ=WEEKLY;COUNT=3',
      }),
      userId,
    );
    await deleteEvent(
      weekly.id,
      deleteEventSchema.parse({ scope: 'this', occurrenceStart: iso('2026-09-14T09:00:00') }),
      userId,
    );
    const feed = await createFeed({ name: 'スマホ', participantIds: [userId] }, userId);
    const ics = await icsOf(feed);
    expect(valuesOf(ics, 'DTSTART')).toEqual(['20260907T000000Z', '20260921T000000Z']);
    // UID は回ごとに違い、取り直しても同じ回は同じものを指す
    expect(valuesOf(ics, 'UID')).toEqual([
      `${weekly.id}-${iso('2026-09-07T09:00:00')}@lifehub`,
      `${weekly.id}-${iso('2026-09-21T09:00:00')}@lifehub`,
    ]);
  });

  it('タスクは配信しない（置かれる日が毎日動くため）', async () => {
    await createEvent(
      createEventSchema.parse({
        kind: 'task',
        title: 'ゴミ出し',
        endsAt: iso('2026-09-15T09:00:00'),
        participantIds: [userId],
      }),
      userId,
    );
    const feed = await createFeed({ name: 'スマホ', participantIds: [userId] }, userId);
    expect(valuesOf(await icsOf(feed), 'SUMMARY')).toEqual([]);
  });

  it('知らないトークンと、失効させた URL では配信しない', async () => {
    const feed = await createFeed({ name: 'スマホ', participantIds: [userId] }, userId);
    const token = tokenOf(feed.url);
    await expect(renderIcs('unknown-token', now)).rejects.toThrow(NotFoundError);
    await revokeFeed(feed.id, userId);
    await expect(renderIcs(token, now)).rejects.toThrow(NotFoundError);
    expect(await listFeeds(userId)).toEqual([]);
  });

  it('1 ユーザーが何本でも持てて、失効は 1 本だけに効く', async () => {
    const phone = await createFeed({ name: 'スマホ', participantIds: [userId] }, userId);
    const partner = await createFeed({ name: '妻のカレンダー', participantIds: [userId] }, userId);
    expect(phone.url).not.toBe(partner.url);
    await revokeFeed(phone.id, userId);
    expect((await listFeeds(userId)).map((feed) => feed.name)).toEqual(['妻のカレンダー']);
    await expect(icsOf(partner)).resolves.toContain('BEGIN:VCALENDAR');
  });

  it('他のユーザーの URL は見えず、失効もさせられない', async () => {
    const feed = await createFeed({ name: 'スマホ', participantIds: [userId] }, userId);
    expect(await listFeeds(otherId)).toEqual([]);
    await expect(revokeFeed(feed.id, otherId)).rejects.toThrow(NotFoundError);
    await expect(icsOf(feed)).resolves.toContain('BEGIN:VCALENDAR');
  });
  it('選んだ参加者が入っている予定だけを配る', async () => {
    const event = (title: string, participantIds: string[]) =>
      createEvent(
        createEventSchema.parse({
          kind: 'event',
          title,
          startsAt: iso('2026-09-15T09:00:00'),
          endsAt: iso('2026-09-15T10:00:00'),
          participantIds,
        }),
        userId,
      );
    await event('A だけ', [userId]);
    await event('B だけ', [otherId]);
    await event('2 人とも', [userId, otherId]);

    const forA = await createFeed({ name: 'A のスマホ', participantIds: [userId] }, userId);
    expect(valuesOf(await icsOf(forA), 'SUMMARY').sort()).toEqual(['2 人とも', 'A だけ']);

    const forBoth = await createFeed({ name: '共有', participantIds: [userId, otherId] }, userId);
    expect(valuesOf(await icsOf(forBoth), 'SUMMARY').sort()).toEqual([
      '2 人とも',
      'A だけ',
      'B だけ',
    ]);
  });

  it('「この回だけ」参加者を変えた回は、変えた後の参加者で絞る', async () => {
    const weekly = await createEvent(
      createEventSchema.parse({
        kind: 'event',
        title: '週次ミーティング',
        startsAt: iso('2026-09-07T09:00:00'),
        endsAt: iso('2026-09-07T10:00:00'),
        participantIds: [userId],
        rrule: 'FREQ=WEEKLY;COUNT=3',
      }),
      userId,
    );
    // 2 回目だけ B に代わってもらう
    await updateEvent(
      weekly.id,
      updateEventSchema.parse({
        kind: 'event',
        title: '週次ミーティング',
        startsAt: iso('2026-09-14T09:00:00'),
        endsAt: iso('2026-09-14T10:00:00'),
        participantIds: [otherId],
        scope: 'this',
        occurrenceStart: iso('2026-09-14T09:00:00'),
      }),
      userId,
    );

    const forA = await createFeed({ name: 'A のスマホ', participantIds: [userId] }, userId);
    expect(valuesOf(await icsOf(forA), 'DTSTART')).toEqual([
      '20260907T000000Z',
      '20260921T000000Z',
    ]);
    const forB = await createFeed({ name: 'B のスマホ', participantIds: [otherId] }, userId);
    expect(valuesOf(await icsOf(forB), 'DTSTART')).toEqual(['20260914T000000Z']);
  });

  it('名前と参加者を後から変えられる（URL は変わらない）', async () => {
    await createEvent(
      createEventSchema.parse({
        kind: 'event',
        title: 'B だけ',
        startsAt: iso('2026-09-15T09:00:00'),
        endsAt: iso('2026-09-15T10:00:00'),
        participantIds: [otherId],
      }),
      userId,
    );
    const feed = await createFeed({ name: 'スマホ', participantIds: [userId] }, userId);
    expect(valuesOf(await icsOf(feed), 'SUMMARY')).toEqual([]);

    await updateFeed(
      feed.id,
      { name: '2 人のカレンダー', participantIds: [userId, otherId] },
      userId,
    );
    const [changed] = await listFeeds(userId);
    expect(changed?.name).toBe('2 人のカレンダー');
    expect(changed?.participantIds.sort()).toEqual([userId, otherId].sort());
    // 渡した先が登録し直さずに済むよう、URL は発行したときのまま
    expect(changed?.url).toBe(feed.url);
    expect(valuesOf(await icsOf(feed), 'SUMMARY')).toEqual(['B だけ']);
  });

  it('他のユーザーの URL は変更できない', async () => {
    const feed = await createFeed({ name: 'スマホ', participantIds: [userId] }, userId);
    await expect(
      updateFeed(feed.id, { name: '乗っ取り', participantIds: [otherId] }, otherId),
    ).rejects.toThrow(NotFoundError);
    const [unchanged] = await listFeeds(userId);
    expect(unchanged?.name).toBe('スマホ');
    expect(unchanged?.participantIds).toEqual([userId]);
  });
});
