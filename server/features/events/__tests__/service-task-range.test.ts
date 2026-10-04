import { beforeEach, describe, expect, it } from 'vitest';
import { iso, jst } from '../../../../shared/__tests__/jst.ts';
import { dateRangeQuerySchema } from '../../../../shared/validation/common.ts';
import { createEventSchema } from '../../../../shared/validation/events.ts';
import { resetUsers } from '../../../lib/db/test-db.ts';
import { completeEvent, createEvent, listItems } from '../service.ts';
import { now, september } from './service-fixtures.ts';

/**
 * 繰り返しのタスクの表示する回は、今と繰り返しだけで決まり、読む範囲によらない（docs/features/events.md）。
 * カレンダーは月ごとの中身をまとめて読んで月で分けるので、範囲で変わると、どの月と一緒に読んだかで
 * 月の中身が変わってしまう。
 */
describe('繰り返しのタスクの表示は読む範囲によらない', () => {
  let userId: string;
  beforeEach(async () => {
    ({ userId } = await resetUsers());
  });

  /** 期限だけを持つ毎月のタスク（開始が無いので、未完了の回は今日に置く） */
  const monthlyDue = (endsAt: string) =>
    createEvent(
      createEventSchema.parse({
        kind: 'task',
        title: '支払い',
        endsAt: iso(endsAt),
        participantIds: [userId],
        rrule: 'FREQ=MONTHLY',
      }),
      userId,
    );

  const october = dateRangeQuerySchema.parse({ from: '2026-10-01', to: '2026-10-31' });
  const both = dateRangeQuerySchema.parse({ from: '2026-09-01', to: '2026-10-31' });
  const shown = async (range: typeof september) =>
    (await listItems(range, now)).map((t) => [t.occurrenceStart, t.placementDate]);

  it('2 つ目の回が範囲の後でも、未完了の先頭 2 つを出す', async () => {
    // 9/20 と 10/20 の回。どちらも開始が無いので今日（9/14）に置く
    await monthlyDue('2026-09-20T10:00:00');
    const expected = [
      [iso('2026-09-20T10:00:00'), '2026-09-14'],
      [iso('2026-10-20T10:00:00'), '2026-09-14'],
    ];
    expect(await shown(september)).toEqual(expected);
    expect(await shown(both)).toEqual(expected);
  });

  it('範囲の後に始まる繰り返しも、今日に置く回は範囲に出る', async () => {
    await monthlyDue('2026-10-20T10:00:00');
    expect(await shown(september)).toEqual([
      [iso('2026-10-20T10:00:00'), '2026-09-14'],
      [iso('2026-11-20T10:00:00'), '2026-09-14'],
    ]);
    expect(await shown(october)).toEqual([]);
  });

  it('始まる前の回を先に完了すると、完了した日の範囲に出る', async () => {
    const created = await monthlyDue('2026-10-20T10:00:00');
    await completeEvent(
      created.id,
      { occurrenceStart: jst('2026-10-20T10:00:00') },
      userId,
      jst('2026-09-14T11:00:00'),
    );
    expect(await shown(september)).toEqual([
      [iso('2026-10-20T10:00:00'), '2026-09-14'],
      [iso('2026-11-20T10:00:00'), '2026-09-14'],
      [iso('2026-12-20T10:00:00'), '2026-09-14'],
    ]);
  });
});
