import { expect, test } from 'vitest';
import { occurrenceTarget } from '../recurrence-options.ts';

test('繰り返しの回は範囲と基準日時で指し、単発は範囲に関わらず行そのものを指す', () => {
  const occurrence = { id: 'a', occurrenceStart: '2030-05-02T01:00:00.000Z' };
  expect(occurrenceTarget(occurrence, 'this')).toEqual({ ...occurrence, scope: 'this' });
  expect(occurrenceTarget(occurrence, 'all')).toEqual({ id: 'a', scope: 'all' });
  expect(occurrenceTarget({ id: 'b', occurrenceStart: null }, 'this')).toEqual({
    id: 'b',
    scope: 'all',
  });
});
