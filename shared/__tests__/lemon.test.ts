import { expect, test } from 'vitest';
import { type CareLog, sortCareLogs } from '../lemon.ts';

const log = (id: string, doneAt: string): CareLog => ({
  id,
  careTypes: ['water'],
  doneAt,
  note: null,
  createdBy: null,
  apiKeyName: null,
});

test('実施日時の古い順に並べ、同じ日時は記録した順（id の順）にする', () => {
  const logs = [
    log('0190000a-0000-7000-8000-000000000002', '2030-05-02T09:00:00.000Z'),
    log('0190000a-0000-7000-8000-000000000003', '2030-05-01T09:00:00.000Z'),
    log('0190000a-0000-7000-8000-000000000001', '2030-05-02T09:00:00.000Z'),
  ];
  expect(sortCareLogs(logs).map((l) => l.id.slice(-1))).toEqual(['3', '1', '2']);
});
