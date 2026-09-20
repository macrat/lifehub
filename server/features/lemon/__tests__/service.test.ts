import { beforeEach, describe, expect, it } from 'vitest';
import { truncateAll } from '../../../lib/test-db.ts';
import { createUser } from '../../users/service.ts';
import { getStatus, logCare } from '../service.ts';

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
});
