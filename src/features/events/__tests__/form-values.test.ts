import { expect, test } from 'vitest';
import { defaultParticipants, defaultTaskValues } from '../form-values.ts';

test('タスクの既定値は日時なし', () => {
  expect(defaultTaskValues([]).startsAt).toBeNull();
  expect(defaultTaskValues([]).endsAt).toBeNull();
});

test('新規作成の既定の参加者は自分だけ', () => {
  expect(defaultParticipants('u1')).toEqual(['u1']);
});

test('ログイン中のユーザーが分からなければ参加者は空', () => {
  expect(defaultParticipants(null)).toEqual([]);
});
