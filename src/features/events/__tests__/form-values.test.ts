import { expect, test } from 'vitest';
import {
  EXTRA_FIELDS_MARKER,
  eventInputFromForm,
  type ItemFormValues,
  shiftedEnd,
  taskInputFromForm,
} from '../form-values.ts';

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

/** 保存されている予定（場所・メモ・通知を持つ） */
const saved: ItemFormValues = {
  title: '歯医者',
  allDay: false,
  startsAt: '2030-02-04T00:00:00.000Z',
  endsAt: '2030-02-04T01:00:00.000Z',
  participantIds: ['u1'],
  location: '駅前',
  note: '保険証',
  rrule: null,
  remindStartMinutes: 30,
  remindEndMinutes: null,
};

/** PC の吹き出しの入力欄（タイトルと参加者だけ） */
function bubble(title: string): FormData {
  const formData = new FormData();
  formData.set('title', title);
  formData.append('participantIds', 'u1');
  return formData;
}

test('残りの項目の欄が無いフォーム（PC の吹き出し）は、場所・メモ・通知を既定値のまま送る', () => {
  expect(eventInputFromForm(bubble('歯科'), { initial: saved, allDay: false })).toMatchObject({
    title: '歯科',
    location: '駅前',
    note: '保険証',
    remindStartMinutes: 30,
  });
  const task = { ...saved, remindStartMinutes: 0, remindEndMinutes: 0 };
  expect(taskInputFromForm(bubble('歯科'), { initial: task, allDay: false })).toMatchObject({
    location: '駅前',
    note: '保険証',
    remindStartMinutes: 0,
    remindEndMinutes: 0,
  });
});

test('残りの項目の欄があれば、空にした欄・外したチェックは消したものとして送る', () => {
  const formData = bubble('歯医者');
  formData.set(EXTRA_FIELDS_MARKER, '1');
  formData.set('location', '');
  formData.set('note', '');
  formData.set('rrule', '');
  const task = { ...saved, remindStartMinutes: 0, remindEndMinutes: 0 };
  expect(taskInputFromForm(formData, { initial: task, allDay: false })).toMatchObject({
    location: null,
    note: null,
    remindStartMinutes: null,
    remindEndMinutes: null,
  });
});
