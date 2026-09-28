import { describe, expect, it } from 'vitest';
import type { CalendarItem } from '../../../../shared/calendar.ts';
import type { DateString } from '../../../../shared/types.ts';
import { defaultTaskValues } from '../../events/form-values.ts';
import type { Draft, DraftRange } from '../draft.ts';
import { composerReducer } from '../use-event-composer.ts';
import { task } from './draft-fixtures.ts';

type State = Parameters<typeof composerReducer>[0];

const DAY = '2031-06-05' as DateString;
const ME = ['me'];
const range: DraftRange = { allDay: false, date: DAY, startMin: 9 * 60, endMin: 10 * 60 };
const moved: DraftRange = { ...range, startMin: 11 * 60, endMin: 12 * 60 };

/** 保存済みの予定（2 人の予定） */
const event: CalendarItem = {
  kind: 'event',
  id: 'e1',
  title: '打ち合わせ',
  allDay: false,
  startsAt: '2031-06-05T00:00:00.000Z',
  endsAt: '2031-06-05T01:00:00.000Z',
  completedAt: null,
  location: null,
  note: null,
  participantIds: ['me', 'partner'],
  rrule: null,
  remindStartMinutes: null,
  remindEndMinutes: null,
  occurrenceStart: null,
  isRecurring: false,
  isModified: false,
  placementDate: DAY,
  dayIndex: 1,
  dayCount: 1,
};

const grab = (state: State, draft: Draft, done = true) =>
  composerReducer(state, { type: 'grab', draft, done, participantIds: ME });

describe('composerReducer', () => {
  it('空いている所をなぞると、自分だけの下書きを下の段で開く（離すまでは入力を出さない）', () => {
    expect(grab(null, { range, item: null }, false)).toEqual({
      mode: 'grid',
      range,
      item: null,
      participantIds: ME,
      settled: false,
      origin: 'grid',
    });
  });

  it('同じ予定を直し続けている間は、選んだ参加者を持ち越す', () => {
    const picked = composerReducer(grab(null, { range, item: null }), {
      type: 'participants',
      participantIds: ['partner'],
    });
    expect(grab(picked, { range: moved, item: null })).toMatchObject({
      range: moved,
      participantIds: ['partner'],
    });
  });

  it('つまむ物が変わったら、その予定の参加者から始める', () => {
    const picked = composerReducer(grab(null, { range, item: null }), {
      type: 'participants',
      participantIds: ['partner'],
    });
    expect(grab(picked, { range, item: event })).toMatchObject({
      item: event,
      participantIds: event.participantIds,
    });
  });

  it('追加ボタンからは既定の参加者で全項目の段を開く', () => {
    expect(composerReducer(null, { type: 'start', range, participantIds: ME })).toMatchObject({
      mode: 'grid',
      item: null,
      settled: true,
      origin: 'add',
    });
  });

  it('入力で直した日時は下書きに戻り、入力を出したままにする', () => {
    const state = grab(null, { range, item: event }, false);
    expect(
      composerReducer(state, { type: 'change', draft: { range: moved, item: event } }),
    ).toMatchObject({
      range: moved,
      item: event,
      settled: true,
    });
  });

  it('タスクは入力で直した日時を持たせたタスクごと差し替える', () => {
    const state = grab(null, { range, item: task }, false);
    const edited = { ...task, startsAt: null };
    expect(
      composerReducer(state, {
        type: 'change',
        draft: { range: moved, item: edited },
      }),
    ).toMatchObject({
      range: moved,
      item: edited,
    });
  });

  it('「その他のオプション」で下書きを閉じ、直している予定ごと全項目のフォームへ移す', () => {
    const values = defaultTaskValues(ME);
    const state = grab(null, { range, item: event });
    expect(composerReducer(state, { type: 'expand', values })).toEqual({
      mode: 'form',
      values,
      item: event,
    });
  });

  it('全項目のフォームの間は下書きへの変更を受け付けない', () => {
    const form: State = { mode: 'form', values: defaultTaskValues(ME), item: null };
    expect(composerReducer(form, { type: 'change', draft: { range, item: null } })).toBe(form);
    expect(composerReducer(form, { type: 'participants', participantIds: [] })).toBe(form);
  });

  it('閉じると何も開いていない', () => {
    expect(composerReducer(grab(null, { range, item: null }), { type: 'close' })).toBeNull();
  });
});
