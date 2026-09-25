import { expect, test } from 'vitest';
import { defaultParticipants, defaultTaskValues, shiftedEnd } from '../form-values.ts';

test('タスクの既定値は終日で、日時なし', () => {
  expect(defaultTaskValues([])).toMatchObject({ allDay: true, startsAt: null, endsAt: null });
});

test('新規作成の既定の参加者は自分だけ', () => {
  expect(defaultParticipants('u1')).toEqual(['u1']);
});

test('ログイン中のユーザーが分からなければ参加者は空', () => {
  expect(defaultParticipants(null)).toEqual([]);
});

test('開始を動かすと、終了は長さを保ったまま同じだけ動く', () => {
  expect(shiftedEnd('2030-02-04T09:00', '2030-02-04T09:30', '2030-02-04T10:00')).toBe(
    '2030-02-04T10:30',
  );
  // 日をまたいで動かしても長さを保つ
  expect(shiftedEnd('2030-02-04T09:00', '2030-02-05T23:30', '2030-02-04T10:00')).toBe(
    '2030-02-06T00:30',
  );
});

test('終日は日数を保ったまま動く', () => {
  expect(shiftedEnd('2030-02-04', '2030-02-27', '2030-02-06')).toBe('2030-03-01');
});

test('書きかけで空の値や、形の揃わない値なら終了は触らない', () => {
  expect(shiftedEnd('2030-02-04T09:00', '', '2030-02-04T10:00')).toBeNull();
  expect(shiftedEnd('2030-02-04T09:00', '2030-02-04T09:30', '')).toBeNull();
  expect(shiftedEnd('2030-02-04', '2030-02-04T09:30', '2030-02-04T10:00')).toBeNull();
});
