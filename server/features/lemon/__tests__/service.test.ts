import { beforeEach, describe, expect, it } from 'vitest';
import { truncateAll } from '../../../lib/test-db.ts';
import { createUser } from '../../users/service.ts';
import { getStatus, listLogs, logCare, updateLog } from '../service.ts';

const jst = (s: string) => new Date(`${s}+09:00`);

describe('lemon service', () => {
  let userId: string;
  beforeEach(async () => {
    await truncateAll();
    userId = (await createUser({ email: 'a@example.com', name: 'A', password: 'password-123456' }))
      .id;
  });

  it('種別ごとに最終実施日と経過日数（JST の暦日差）を返す', async () => {
    await logCare({ careType: 'water', doneAt: jst('2026-09-10T23:30:00'), note: null }, userId);
    await logCare({ careType: 'water', doneAt: jst('2026-09-12T08:00:00'), note: null }, userId);
    await logCare(
      { careType: 'mist', doneAt: jst('2026-09-13T08:00:00'), note: 'たっぷり' },
      userId,
    );
    const status = await getStatus(jst('2026-09-14T00:10:00'));
    expect(status).toEqual([
      { careType: 'water', lastDoneAt: jst('2026-09-12T08:00:00').toISOString(), daysSince: 2 },
      { careType: 'mist', lastDoneAt: jst('2026-09-13T08:00:00').toISOString(), daysSince: 1 },
      { careType: 'fertilize', lastDoneAt: null, daysSince: null },
      { careType: 'bloom', lastDoneAt: null, daysSince: null },
      { careType: 'harvest', lastDoneAt: null, daysSince: null },
    ]);
  });

  it('記録を編集すると全項目が置き換わり、状態にも反映される', async () => {
    const log = await logCare(
      { careType: 'water', doneAt: jst('2026-09-10T08:00:00'), note: null },
      userId,
    );
    const updated = await updateLog(log.id, {
      careType: 'fertilize',
      doneAt: jst('2026-09-12T08:00:00'),
      note: 'まちがえて水やりで記録していた',
    });

    expect(updated).toMatchObject({
      id: log.id,
      careType: 'fertilize',
      doneAt: jst('2026-09-12T08:00:00').toISOString(),
      note: 'まちがえて水やりで記録していた',
      // 記録した人は編集しても変わらない
      createdBy: userId,
    });
    expect(await listLogs()).toEqual([updated]);

    // 直した種別の方にだけ日付が付く（元の種別は未実施に戻る）
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
});
