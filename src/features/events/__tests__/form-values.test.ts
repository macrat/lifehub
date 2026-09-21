import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { DateString } from '../../../../shared/types.ts';
import { toDateTimeLocalValue } from '../../../lib/date.ts';
import { defaultEventValues, defaultTaskValues } from '../form-values.ts';

/** 既定値（ISO 文字列）をフォームに出る JST の値で比べる */
const local = (value: string | null) => (value ? toDateTimeLocalValue(value) : null);

const at = (now: string) => vi.setSystemTime(new Date(now));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('予定の既定値は現在時刻の分を切り上げた正時から 1 時間', () => {
  at('2026-09-21T17:11:00+09:00');
  expect(local(defaultEventValues().startsAt)).toBe('2026-09-21T18:00');
  expect(local(defaultEventValues().endsAt)).toBe('2026-09-21T19:00');
});

test('ちょうど正時なら切り上げない', () => {
  at('2026-09-21T17:00:00+09:00');
  expect(local(defaultEventValues().startsAt)).toBe('2026-09-21T17:00');
});

test('切り上げが日をまたぐなら翌日の 0 時', () => {
  at('2026-09-21T23:30:00+09:00');
  expect(local(defaultEventValues().startsAt)).toBe('2026-09-22T00:00');
});

test('日を指定すればその日の同じ時刻', () => {
  at('2026-09-21T17:11:00+09:00');
  const values = defaultEventValues('2026-10-05' as DateString);
  expect(local(values.startsAt)).toBe('2026-10-05T18:00');
  expect(local(values.endsAt)).toBe('2026-10-05T19:00');
});

test('タスクの既定値は日時なし', () => {
  at('2026-09-21T17:11:00+09:00');
  expect(defaultTaskValues().startsAt).toBeNull();
  expect(defaultTaskValues().endsAt).toBeNull();
});
