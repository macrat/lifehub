import { describe, expect, it } from 'vitest';
import { iso } from '../../../../shared/__tests__/jst.ts';
import { itemDraft } from '../draft.ts';
import { taskDraftFromInput, taskDraftText, taskDraftValues } from '../task-draft.ts';
import { allDay, DAY, day, task } from './draft-fixtures.ts';

/** 時間軸の枠（その日の分） */
const timedAt = (date: string, startMin: number) => ({
  allDay: false as const,
  date: day(date),
  startMin,
  endMin: startMin + 30,
});

/** 終日のタスク（6/5 開始、6/7 期限。期限は排他的な終端で持つ） */
const allDayTask = {
  ...task,
  allDay: true,
  startsAt: iso('2031-06-05T00:00:00'),
  endsAt: iso('2031-06-08T00:00:00'),
};

describe('taskDraftValues', () => {
  it('落とした日時を開始にし、期限は開始〜期限の長さを保ってずらす', () => {
    // 期限の 18:00 に置かれたタスクを翌日の 20:00 へ
    expect(taskDraftValues(task, timedAt('2031-06-06', 20 * 60), ['u1'])).toMatchObject({
      allDay: false,
      startsAt: iso('2031-06-06T20:00:00'),
      endsAt: iso('2031-06-07T05:00:00'),
    });
  });

  it('動かしていなければ開始は置かれた所になる（期限は長さを保つ）', () => {
    const values = taskDraftValues(task, itemDraft(task) ?? allDay(DAY, DAY), ['u1']);
    expect(values).toMatchObject({
      startsAt: iso('2031-06-05T18:00:00'),
      endsAt: iso('2031-06-06T03:00:00'),
    });
  });

  it('開始の無いタスクは開始が付き、期限は動かした分だけずらす', () => {
    const dueOnly = { ...task, startsAt: null };
    expect(taskDraftValues(dueOnly, timedAt(DAY, 19 * 60), ['u1'])).toMatchObject({
      startsAt: iso('2031-06-05T19:00:00'),
      endsAt: iso('2031-06-05T19:00:00'),
    });
    // 今日（6/5）に置かれた、6/7 期限の終日のタスクを 6/7 へ: 2 日ずらす
    const allDayDue = { ...allDayTask, startsAt: null };
    expect(taskDraftValues(allDayDue, allDay('2031-06-07', '2031-06-07'), ['u1'])).toMatchObject({
      allDay: true,
      startsAt: iso('2031-06-07T00:00:00'),
      endsAt: iso('2031-06-10T00:00:00'),
    });
  });

  it('終日のタスクは日の並びで日だけ動く', () => {
    expect(taskDraftValues(allDayTask, allDay('2031-06-10', '2031-06-10'), ['u1'])).toMatchObject({
      allDay: true,
      startsAt: iso('2031-06-10T00:00:00'),
      endsAt: iso('2031-06-13T00:00:00'),
    });
  });

  it('時刻を持つタスクを日の並びで動かすと、開始の時刻のままその日へ移る', () => {
    const dueLater = { ...task, endsAt: iso('2031-06-07T18:00:00') };
    expect(taskDraftValues(dueLater, allDay('2031-06-06', '2031-06-06'), ['u1'])).toMatchObject({
      allDay: false,
      startsAt: iso('2031-06-06T09:00:00'),
      endsAt: iso('2031-06-08T18:00:00'),
    });
  });

  it('日時の無いタスクは落とした日を開始日にした日だけのタスクになる', () => {
    const undated = { ...task, startsAt: null, endsAt: null };
    expect(taskDraftValues(undated, allDay('2031-06-09', '2031-06-09'), ['u1'])).toMatchObject({
      allDay: true,
      startsAt: iso('2031-06-09T00:00:00'),
      endsAt: null,
    });
  });

  it('残りの項目は持ち越し、参加者は選んでいるものにする', () => {
    expect(taskDraftValues(task, timedAt(DAY, 600), ['u1', 'u2'])).toMatchObject({
      title: '書類を出す',
      remindEndMinutes: 0,
      participantIds: ['u1', 'u2'],
    });
  });
});

describe('taskDraftFromInput', () => {
  it('入力した日時をそのまま返す枠とタスクになる（期限を数え直さない）', () => {
    const input = {
      allDay: false,
      startsAt: iso('2031-06-10T08:15:00'),
      endsAt: iso('2031-06-20T12:00:00'),
    };
    const next = taskDraftFromInput(task, input);
    expect(next?.range).toEqual(timedAt('2031-06-10', 8 * 60 + 15));
    expect(next && taskDraftValues(next.item, next.range, ['u1'])).toMatchObject(input);
  });

  it('終日の期限は「含む日」で受け取り、排他的な終端で持つ', () => {
    const next = taskDraftFromInput(task, {
      allDay: true,
      startsAt: iso('2031-06-10T00:00:00'),
      endsAt: iso('2031-06-12T00:00:00'),
    });
    expect(next?.range).toEqual(allDay('2031-06-10', '2031-06-10'));
    expect(next && taskDraftValues(next.item, next.range, ['u1'])).toMatchObject({
      allDay: true,
      startsAt: iso('2031-06-10T00:00:00'),
      endsAt: iso('2031-06-13T00:00:00'),
    });
  });

  it('開始が空なら枠に置けない', () => {
    expect(taskDraftFromInput(task, { allDay: true, startsAt: null, endsAt: null })).toBeNull();
  });
});

describe('taskDraftText', () => {
  it('開始と期限。終日は日付だけ', () => {
    expect(taskDraftText(taskDraftValues(task, timedAt(DAY, 600), ['u1']))).toBe(
      '開始 6/5(木) 10:00 / 期限 6/5(木) 19:00',
    );
    expect(taskDraftText(allDayTask)).toBe('開始 6/5(木) / 期限 6/7(土)');
    expect(taskDraftText({ ...task, endsAt: null })).toBe('開始 6/5(木) 09:00');
  });
});
