import { expect, test } from 'vitest';
import { defaultTaskValues } from '../form-values.ts';

test('タスクの既定値は日時なし', () => {
  expect(defaultTaskValues().startsAt).toBeNull();
  expect(defaultTaskValues().endsAt).toBeNull();
});
