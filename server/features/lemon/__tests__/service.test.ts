import { beforeEach, describe, expect, it } from 'vitest';
import { jst } from '../../../../shared/__tests__/jst.ts';
import { addDays } from '../../../../shared/date.ts';
import { newId } from '../../../../shared/id.ts';
import { dateStringSchema } from '../../../../shared/validation/common.ts';
import { type CareLogListQuery, careLogSchema } from '../../../../shared/validation/lemon.ts';
import { createTestUser, truncateAll } from '../../../lib/test-db.ts';
import { getStatus, listLogs, logCare, updateLog } from '../service.ts';

describe('lemon service', () => {
  let userId: string;
  beforeEach(async () => {
    await truncateAll();
    userId = await createTestUser('A');
  });

  it('1 件の記録が複数の項目を進め、項目ごとに最終実施日と経過日数（JST の暦日差）を返す', async () => {
    await logCare({ careTypes: ['water'], doneAt: jst('2026-09-10T23:30:00'), note: null }, userId);
    await logCare(
      // 葉水と水やりはまとめてやり、その過程で開花に気づく
      { careTypes: ['mist', 'water', 'bloom'], doneAt: jst('2026-09-12T08:00:00'), note: null },
      userId,
    );
    await logCare(
      { careTypes: ['mist'], doneAt: jst('2026-09-13T08:00:00'), note: 'たっぷり' },
      userId,
    );
    const status = await getStatus(jst('2026-09-14T00:10:00'));
    expect(status).toEqual([
      { careType: 'mist', lastDoneAt: jst('2026-09-13T08:00:00').toISOString(), daysSince: 1 },
      { careType: 'water', lastDoneAt: jst('2026-09-12T08:00:00').toISOString(), daysSince: 2 },
      { careType: 'fertilize', lastDoneAt: null, daysSince: null },
      { careType: 'bloom', lastDoneAt: jst('2026-09-12T08:00:00').toISOString(), daysSince: 2 },
      { careType: 'drop', lastDoneAt: null, daysSince: null },
      { careType: 'harvest', lastDoneAt: null, daysSince: null },
    ]);
  });

  it('項目を 1 つも持たない記録（メモ）はどのタイルも動かさない', async () => {
    await logCare({ careTypes: [], doneAt: jst('2026-09-13T08:00:00'), note: '新芽' }, userId);
    const status = await getStatus(jst('2026-09-14T00:10:00'));
    expect(status.every((s) => s.lastDoneAt === null)).toBe(true);
    expect((await listLogs({})).items).toMatchObject([{ careTypes: [], note: '新芽' }]);
  });

  it('項目の並びは入力の順ではなく CARE_TYPES の順に揃う（重複も落ちる）', async () => {
    const input = careLogSchema.parse({
      careTypes: ['harvest', 'mist', 'bloom', 'mist'],
      doneAt: jst('2026-09-13T08:00:00').toISOString(),
      note: null,
    });
    expect((await logCare(input, userId)).careTypes).toEqual(['mist', 'bloom', 'harvest']);
  });

  it('項目もメモも無い記録は DB が弾く（何も残らない記録は作れない）', async () => {
    await expect(
      logCare({ careTypes: [], doneAt: jst('2026-09-13T08:00:00'), note: null }, userId),
    ).rejects.toThrow();
  });

  it('同じ id で送り直しても二重に記録されない（オフラインで溜めた書き込みの再送）', async () => {
    const id = newId();
    const input = {
      careTypes: ['water' as const],
      doneAt: jst('2026-09-10T08:00:00'),
      note: null,
    };
    await logCare(input, userId, id);
    await logCare(input, userId, id);

    expect((await listLogs({})).items).toHaveLength(1);
    expect((await listLogs({})).items[0]).toMatchObject({ id, careTypes: ['water'] });
  });

  it('記録した人を持ち、分からない記録（API キーで入れたもの）は null のまま残る', async () => {
    const doneAt = jst('2026-09-10T08:00:00');
    const known = await logCare({ careTypes: ['water'], doneAt, note: null }, userId);
    const unknown = await logCare({ careTypes: ['mist'], doneAt, note: null }, null);

    expect(known.createdBy).toBe(userId);
    expect(unknown.createdBy).toBeNull();
    expect((await listLogs({})).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: known.id, createdBy: userId }),
        expect.objectContaining({ id: unknown.id, createdBy: null }),
      ]),
    );
  });

  it('編集した後に古い作成が送り直されても、編集は巻き戻らない', async () => {
    const id = newId();
    const input = { careTypes: ['water' as const], doneAt: jst('2026-09-10T08:00:00'), note: null };
    await logCare(input, userId, id);
    await updateLog(id, { ...input, note: '追肥の予定' });
    const resent = await logCare(input, userId, id);

    expect(resent).toMatchObject({ id, note: '追肥の予定' });
    expect((await listLogs({})).items).toMatchObject([{ id, note: '追肥の予定' }]);
  });

  it('記録を編集すると全項目が置き換わり、状態にも反映される', async () => {
    const log = await logCare(
      { careTypes: ['water'], doneAt: jst('2026-09-10T08:00:00'), note: null },
      userId,
    );
    await updateLog(log.id, {
      careTypes: ['fertilize'],
      doneAt: jst('2026-09-12T08:00:00'),
      note: 'まちがえて水やりで記録していた',
    });

    expect((await listLogs({})).items).toEqual([
      {
        id: log.id,
        careTypes: ['fertilize'],
        doneAt: jst('2026-09-12T08:00:00').toISOString(),
        note: 'まちがえて水やりで記録していた',
        // 記録した人は編集しても変わらない
        createdBy: userId,
      },
    ]);

    // 直した項目の方にだけ日付が付く（元の項目は未実施に戻る）
    const status = await getStatus(jst('2026-09-14T00:10:00'));
    expect(status).toContainEqual({
      careType: 'water',
      lastDoneAt: null,
      daysSince: null,
    });
    expect(status).toContainEqual({
      careType: 'fertilize',
      lastDoneAt: jst('2026-09-12T08:00:00').toISOString(),
      daysSince: 2,
    });
  });

  describe('記録のページ', () => {
    const on = dateStringSchema.parse;
    const log = (doneAt: string, values: Partial<Parameters<typeof logCare>[0]> = {}) =>
      logCare({ careTypes: ['water'], doneAt: jst(doneAt), note: null, ...values }, userId);

    it('新しいほうから 1 ページを古い順で返し、JST の日の途中では切らない', async () => {
      // JST の 1/1〜2/18 に 1 日 1 件（49 件）。1/2 には 0:30 と 23:30 にもう 2 件（UTC では前日と当日）
      for (let d = 0; d < 49; d++) {
        const day = addDays(on('2026-01-01'), d);
        await log(`${day}T12:00:00`);
      }
      await log('2026-01-02T00:30:00');
      await log('2026-01-02T23:30:00');

      // 新しいほうから 50 件目は 1/2 の記録。1/2 の 3 件はすべてこのページに入る
      const first = await listLogs({});
      expect(first.items).toHaveLength(50);
      expect(first.items[0]?.doneAt).toBe(jst('2026-01-02T00:30:00').toISOString());
      expect(first.items.map((l) => l.doneAt)).toEqual(first.items.map((l) => l.doneAt).sort());
      expect(first.nextCursor).toBe('2026-01-02');

      const second = await listLogs({ before: on('2026-01-02') });
      expect(second.items.map((l) => l.doneAt)).toEqual([jst('2026-01-01T12:00:00').toISOString()]);
      expect(second.nextCursor).toBeNull();
    });

    it('項目・実施日の範囲（JST の暦日、両端を含む）・メモで絞り込む', async () => {
      await log('2026-09-01T00:30:00', { careTypes: ['mist', 'water'] });
      await log('2026-09-02T23:30:00', { careTypes: ['fertilize'], note: '液肥を 100% 薄めず' });
      await log('2026-09-03T00:00:00', { careTypes: [], note: '新芽' });
      const doneAts = async (query: CareLogListQuery) =>
        (await listLogs(query)).items.map((l) => l.doneAt);
      expect(await doneAts({ kind: 'mist' })).toEqual([jst('2026-09-01T00:30:00').toISOString()]);
      expect(await doneAts({ kind: 'water' })).toHaveLength(1);
      expect(await doneAts({ since: on('2026-09-02'), until: on('2026-09-02') })).toEqual([
        jst('2026-09-02T23:30:00').toISOString(),
      ]);
      expect(await doneAts({ q: '100%' })).toHaveLength(1);
      expect(await doneAts({ q: '新芽' })).toEqual([jst('2026-09-03T00:00:00').toISOString()]);
    });
  });
});
