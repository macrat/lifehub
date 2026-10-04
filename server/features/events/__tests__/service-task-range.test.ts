import { beforeEach, describe, expect, it } from 'vitest';
import { iso, jst } from '../../../../shared/__tests__/jst.ts';
import { dateRangeQuerySchema } from '../../../../shared/validation/common.ts';
import { resetUsers } from '../../../lib/db/test-db.ts';
import { completeEvent, createEvent, listItems } from '../service.ts';
import { now, september, taskInput } from './service-fixtures.ts';

/** 繰り返しのタスクの表示する回は、今と繰り返しだけで決まり、読む範囲によらない（docs/features/events.md） */
describe('繰り返しのタスクの表示は読む範囲によらない', () => {
  let userId: string;
  beforeEach(async () => {
    ({ userId } = await resetUsers());
  });

  /** 毎月のタスク（開始の回が未来ならその日、過去なら今日に置く） */
  const monthly = (startsAt: string) =>
    createEvent(
      taskInput(userId, { title: '支払い', startsAt: iso(startsAt), rrule: 'FREQ=MONTHLY' }),
      userId,
    );

  const range = (from: string, to: string) => dateRangeQuerySchema.parse({ from, to });
  const shown = async (r: typeof september) =>
    (await listItems(r, now)).map((t) => [t.occurrenceStart, t.placementDate]);

  it('2 つ目の回が範囲の後でも、出す回は今から数えた未完了の先頭 2 つ', async () => {
    // 9/10（過ぎたので今日 9/14）と 10/10（その日）。11/10 は 3 つ目なので、どの範囲でも出ない
    await monthly('2026-09-10T10:00:00');
    expect(await shown(september)).toEqual([[iso('2026-09-10T10:00:00'), '2026-09-14']]);
    expect(await shown(range('2026-09-01', '2026-11-30'))).toEqual([
      [iso('2026-09-10T10:00:00'), '2026-09-14'],
      [iso('2026-10-10T10:00:00'), '2026-10-10'],
    ]);
  });

  it('範囲の後に始まる繰り返しも、範囲によらず先頭の 2 つの回だけを出す', async () => {
    await monthly('2026-10-20T10:00:00');
    expect(await shown(september)).toEqual([]);
    expect(await shown(range('2026-11-01', '2026-11-30'))).toEqual([
      [iso('2026-11-20T10:00:00'), '2026-11-20'],
    ]);
    expect(await shown(range('2026-12-01', '2026-12-31'))).toEqual([]);
  });

  it('始まる前の回を先に完了すると、完了した日の範囲に出る', async () => {
    const created = await monthly('2026-10-20T10:00:00');
    await completeEvent(
      created.id,
      { occurrenceStart: jst('2026-10-20T10:00:00') },
      userId,
      jst('2026-09-14T11:00:00'),
    );
    // 開始（10/20）が範囲の後の繰り返しでも、完了した回は完了した日（9/14）に出る
    expect(await shown(september)).toEqual([[iso('2026-10-20T10:00:00'), '2026-09-14']]);
  });
});
