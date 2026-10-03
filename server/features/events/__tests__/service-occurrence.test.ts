import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { iso, jst } from '../../../../shared/__tests__/jst.ts';
import { newId } from '../../../../shared/id.ts';
import { createEventSchema, updateEventSchema } from '../../../../shared/validation/events.ts';
import { db } from '../../../lib/db/client.ts';
import { resetUsers } from '../../../lib/db/test-db.ts';
import { events } from '../schema.ts';
import { completeEvent, createEvent, listItems, updateEvent } from '../service.ts';
import { now, september } from './service-fixtures.ts';

/** 繰り返しの回の実体化（「この回だけ」の変更・完了）で、回の行と参加者が必ず一緒に書かれること */

let userId: string;
let partnerId: string;

const weeklyTask = () =>
  createEventSchema.parse({
    kind: 'task',
    title: 'ゴミ出し',
    endsAt: iso('2026-09-07T09:00:00'),
    participantIds: [userId],
    rrule: 'FREQ=WEEKLY',
  });

const secondOccurrence = jst('2026-09-14T09:00:00');

async function occurrenceRows(seriesId: string) {
  return db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.seriesId, seriesId), eq(events.occurrenceStart, secondOccurrence)));
}

async function participantsOf(seriesId: string) {
  const items = await listItems(september, now);
  return items.find(
    (i) => i.id === seriesId && i.occurrenceStart === secondOccurrence.toISOString(),
  )?.participantIds;
}

describe('繰り返しの回の実体化', () => {
  beforeEach(async () => {
    ({ userId, partnerId } = await resetUsers());
  });

  it('参加者を書けなければ、回の行も残さない（原子的）', async () => {
    const master = await createEvent(weeklyTask(), userId);
    const input = updateEventSchema.parse({
      ...weeklyTask(),
      startsAt: null,
      endsAt: secondOccurrence.toISOString(),
      title: '変更',
      // 存在しないユーザー: 参加者の挿入が外部キーで落ちる
      participantIds: [newId()],
      scope: 'this',
      occurrenceStart: secondOccurrence.toISOString(),
    });
    await expect(updateEvent(master.id, input, userId)).rejects.toThrow();
    expect(await occurrenceRows(master.id)).toEqual([]);
  });

  it('参加者を持たない回の行があっても、次の実体化で繰り返し元の参加者を写す', async () => {
    const master = await createEvent(weeklyTask(), userId);
    // 参加者の無い回の行（参加者の書き込みだけが失敗した状態）
    await db.insert(events).values({
      id: newId(),
      kind: 'task',
      title: 'ゴミ出し',
      endsAt: secondOccurrence,
      seriesId: master.id,
      occurrenceStart: secondOccurrence,
      createdBy: userId,
    });
    await completeEvent(master.id, { occurrenceStart: secondOccurrence }, userId, now);
    expect(await participantsOf(master.id)).toEqual([userId]);
  });

  it('参加者を指定しない実体化（完了）は、回が持つ参加者を繰り返し元の参加者で上書きしない', async () => {
    const master = await createEvent(weeklyTask(), userId);
    await updateEvent(
      master.id,
      updateEventSchema.parse({
        ...weeklyTask(),
        endsAt: secondOccurrence.toISOString(),
        participantIds: [partnerId],
        scope: 'this',
        occurrenceStart: secondOccurrence.toISOString(),
      }),
      userId,
    );
    await completeEvent(master.id, { occurrenceStart: secondOccurrence }, userId, now);
    expect(await participantsOf(master.id)).toEqual([partnerId]);
    expect(await occurrenceRows(master.id)).toHaveLength(1);
  });
});
