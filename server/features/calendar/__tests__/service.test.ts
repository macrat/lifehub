import { beforeEach, describe, expect, it } from 'vitest';
import { createEventSchema } from '../../../../shared/validation/events.ts';
import { truncateAll } from '../../../lib/test-db.ts';
import { createEvent } from '../../events/service.ts';
import { createUser } from '../../users/service.ts';
import { listItems } from '../service.ts';

const iso = (s: string) => new Date(`${s}+09:00`).toISOString();

describe('calendar service', () => {
  let userId: string;
  beforeEach(async () => {
    await truncateAll();
    userId = (await createUser({ email: 'a@example.com', name: 'A', password: 'password-123456' }))
      .id;
  });

  it('複数日の予定は日ごとに 1 件、同日内は終日が先', async () => {
    await createEvent(
      createEventSchema.parse({
        title: '旅行',
        allDay: true,
        startsAt: iso('2026-09-20T00:00:00'),
        endsAt: iso('2026-09-22T00:00:00'),
      }),
      userId,
    );
    await createEvent(
      createEventSchema.parse({
        title: '朝食',
        startsAt: iso('2026-09-20T08:00:00'),
        endsAt: iso('2026-09-20T09:00:00'),
      }),
      userId,
    );
    const items = await listItems({ from: '2026-09-20', to: '2026-09-21' });
    expect(
      items.map((i) => [
        i.placementDate,
        i.title,
        ...(i.kind === 'event' ? [i.dayIndex, i.dayCount] : []),
      ]),
    ).toEqual([
      ['2026-09-20', '旅行', 1, 3],
      ['2026-09-20', '朝食', 1, 1],
      ['2026-09-21', '旅行', 2, 3],
    ]);
  });

  it('深夜をまたぐ予定は JST の日付で 2 日に置かれる', async () => {
    await createEvent(
      createEventSchema.parse({
        title: '夜勤',
        startsAt: iso('2026-09-20T22:00:00'),
        endsAt: iso('2026-09-21T06:00:00'),
      }),
      userId,
    );
    const items = await listItems({ from: '2026-09-21', to: '2026-09-21' });
    expect(items.map((i) => [i.placementDate, i.kind === 'event' ? i.dayIndex : null])).toEqual([
      ['2026-09-21', 2],
    ]);
  });
});
