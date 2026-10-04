import { expect, test } from 'vitest';
import {
  EXTRA_FIELDS_MARKER,
  type ItemFormValues,
  itemInputFromForm,
  shiftedEnd,
  switchKindValues,
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
  expect(
    itemInputFromForm('event', bubble('歯科'), { initial: saved, allDay: false }),
  ).toMatchObject({
    title: '歯科',
    location: '駅前',
    note: '保険証',
    remindStartMinutes: 30,
  });
  const task = { ...saved, endsAt: null, remindStartMinutes: 0 };
  expect(itemInputFromForm('task', bubble('歯科'), { initial: task, allDay: false })).toMatchObject(
    {
      location: '駅前',
      note: '保険証',
      remindStartMinutes: 0,
    },
  );
  // 予定の終了前の通知（MCP から入れたもの）は欄が無いので既定値のまま
  const ending = { ...saved, remindEndMinutes: 5 };
  expect(
    itemInputFromForm('event', bubble('歯科'), { initial: ending, allDay: false }),
  ).toMatchObject({ remindEndMinutes: 5 });
});

test('残りの項目の欄があれば、空にした欄・外したチェックは消したものとして送る', () => {
  const formData = bubble('歯医者');
  formData.set(EXTRA_FIELDS_MARKER, '1');
  formData.set('location', '');
  formData.set('note', '');
  formData.set('rrule', '');
  const task = { ...saved, endsAt: null, remindStartMinutes: 0 };
  expect(itemInputFromForm('task', formData, { initial: task, allDay: false })).toMatchObject({
    location: null,
    note: null,
    remindStartMinutes: null,
  });
});

test('タスクは終了と終了前の通知を送らない', () => {
  const formData = bubble('歯医者');
  formData.set('startsAtDate', '2030-02-04');
  formData.set('endsAtDate', '2030-02-05');
  expect(
    itemInputFromForm('task', formData, {
      initial: { ...saved, remindEndMinutes: 5 },
      allDay: true,
    }),
  ).toMatchObject({ endsAt: null, remindEndMinutes: null });
});

test('タスクの通知は予定と同じく何分前かを選び、終日なら日単位に寄せた既定値を使う', () => {
  const formData = bubble('歯医者');
  formData.set(EXTRA_FIELDS_MARKER, '1');
  formData.set('remindStartMinutes', '30');
  expect(itemInputFromForm('task', formData, { initial: saved, allDay: false })).toMatchObject({
    remindStartMinutes: 30,
  });
  // 欄の無い吹き出しで終日にしたら、30 分前は前日に寄せる（終日では n 分前を選べない）
  expect(
    itemInputFromForm('task', bubble('歯医者'), { initial: saved, allDay: true }),
  ).toMatchObject({
    remindStartMinutes: 1440,
  });
});

test('予定をタスクにすると開始だけを引き継ぎ、終了と終了前の通知は消える', () => {
  const event = { ...saved, remindEndMinutes: 10 };
  expect(
    switchKindValues(event, { allDay: false, startsAt: '2030-02-04T02:00:00.000Z' }, 'task'),
  ).toEqual({
    ...event,
    startsAt: '2030-02-04T02:00:00.000Z',
    endsAt: null,
    remindEndMinutes: null,
  });
});

test('タスクを予定にすると、開始から 1 時間（終日ならその日 1 日）の予定になる', () => {
  const task = { ...saved, endsAt: null };
  expect(
    switchKindValues(task, { allDay: false, startsAt: '2030-02-04T02:00:00.000Z' }, 'event'),
  ).toMatchObject({
    allDay: false,
    startsAt: '2030-02-04T02:00:00.000Z',
    endsAt: '2030-02-04T03:00:00.000Z',
    remindStartMinutes: 30,
    remindEndMinutes: null,
  });
  // 2/4 JST の終日
  expect(
    switchKindValues(task, { allDay: true, startsAt: '2030-02-03T15:00:00.000Z' }, 'event'),
  ).toMatchObject({
    allDay: true,
    startsAt: '2030-02-03T15:00:00.000Z',
    endsAt: '2030-02-04T15:00:00.000Z',
  });
});

test('終日の予定にするときも、日時以外の項目は引き継ぐ', () => {
  const task = { ...saved, endsAt: null };
  expect(switchKindValues(task, { allDay: true, startsAt: saved.startsAt }, 'event')).toMatchObject(
    {
      allDay: true,
      location: '駅前',
      note: '保険証',
      remindStartMinutes: 30,
    },
  );
});

test('開始の欄が空（書きかけ）のまま切り替えると、今日の終日になる', () => {
  const now = new Date('2030-02-04T12:00:00+09:00');
  expect(switchKindValues(saved, { allDay: true, startsAt: null }, 'event', now)).toMatchObject({
    allDay: true,
    startsAt: '2030-02-03T15:00:00.000Z',
    endsAt: '2030-02-04T15:00:00.000Z',
  });
});

test('日付と時刻に分けた欄を 1 つの日時にし、終日では日付だけを読む', () => {
  const formData = bubble('歯医者');
  formData.set('startsAtDate', '2030-02-04');
  formData.set('startsAtTime', '09:30');
  formData.set('endsAtDate', '2030-02-04');
  formData.set('endsAtTime', '10:00');
  expect(itemInputFromForm('event', formData, { initial: saved, allDay: false })).toMatchObject({
    startsAt: '2030-02-04T00:30:00.000Z',
    endsAt: '2030-02-04T01:00:00.000Z',
  });

  const allDay = bubble('旅行');
  allDay.set('startsAtDate', '2030-02-04');
  allDay.set('endsAtDate', '2030-02-05');
  expect(itemInputFromForm('event', allDay, { initial: saved, allDay: true })).toMatchObject({
    allDay: true,
    startsAt: '2030-02-03T15:00:00.000Z',
    endsAt: '2030-02-04T15:00:00.000Z',
  });
});

test('開始の日時は両方空なら未設定（検証で止まる）、日付か時刻の片方だけなら書きかけとしてその欄で止める', () => {
  const formData = bubble('提出');
  formData.set('startsAtDate', '');
  formData.set('startsAtTime', '');
  expect(itemInputFromForm('task', formData, { initial: saved, allDay: false })).toMatchObject({
    startsAt: null,
  });
  formData.set('startsAtDate', '2030-02-04');
  expect(() => itemInputFromForm('task', formData, { initial: saved, allDay: false })).toThrow(
    expect.objectContaining({ field: 'startsAt', message: '日付と時刻を入力してください' }),
  );
});
