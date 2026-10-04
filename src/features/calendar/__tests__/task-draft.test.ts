import { describe, expect, it } from 'vitest';
import { iso } from '../../../../shared/__tests__/jst.ts';
import type { CalendarTaskItem } from '../../../../shared/calendar.ts';
import { type DraftRange, itemDraft } from '../draft.ts';
import {
  newTaskTimes,
  taskDraftFromInput,
  taskDraftText,
  taskTimesAt,
  taskTimesOf,
} from '../task-draft.ts';
import { allDay, DAY, day, task } from './draft-fixtures.ts';

/** 時間軸の枠（その日の分） */
const timedAt = (date: string, startMin: number) => ({
  allDay: false as const,
  date: day(date),
  startMin,
  endMin: startMin + 30,
});

/** 終日のタスク（6/5 開始） */
const allDayTask = { ...task, allDay: true, startsAt: iso('2031-06-05T00:00:00') };

/** 保存済みのタスクを枠 range へ動かしたときの値（残りの項目はタスクのまま） */
const taskDraftValues = (t: CalendarTaskItem, range: DraftRange) => ({
  ...t,
  ...taskTimesAt(taskTimesOf(t, range), range),
});

describe('taskTimesAt（保存済みのタスクを動かす）', () => {
  it('落とした日時を開始にする', () => {
    // 開始の 9:00 に置かれたタスクを翌日の 20:00 へ
    expect(taskDraftValues(task, timedAt('2031-06-06', 20 * 60))).toMatchObject({
      allDay: false,
      startsAt: iso('2031-06-06T20:00:00'),
      endsAt: null,
    });
  });

  it('動かしていなければ開始はそのまま', () => {
    const values = taskDraftValues(task, itemDraft(task) ?? allDay(DAY, DAY));
    expect(values).toMatchObject({ startsAt: task.startsAt, endsAt: null });
  });

  it('終日のタスクは日の並びで日だけ動く', () => {
    expect(taskDraftValues(allDayTask, allDay('2031-06-10', '2031-06-10'))).toMatchObject({
      allDay: true,
      startsAt: iso('2031-06-10T00:00:00'),
    });
  });

  it('時刻を持つタスクを日の並びで動かすと、開始の時刻のままその日へ移る', () => {
    expect(taskDraftValues(task, allDay('2031-06-06', '2031-06-06'))).toMatchObject({
      allDay: false,
      startsAt: iso('2031-06-06T09:00:00'),
    });
  });

  it('今日へ繰り越したタスクは、置かれた今日の帯から落とした日へ開始ごと移る', () => {
    // 6/1 9:00 開始のタスクが今日（6/5）に置かれている
    const carried = { ...task, startsAt: iso('2031-06-01T09:00:00') };
    expect(taskDraftValues(carried, allDay('2031-06-09', '2031-06-09'))).toMatchObject({
      allDay: false,
      startsAt: iso('2031-06-09T09:00:00'),
    });
  });

  it('残りの項目は持ち越す', () => {
    expect(taskDraftValues(task, timedAt(DAY, 600))).toMatchObject({
      title: '書類を出す',
      remindStartMinutes: 0,
    });
  });
});

describe('taskDraftFromInput', () => {
  it('入力した日時をそのまま返す枠とタスクになる', () => {
    const input = { allDay: false, startsAt: iso('2031-06-10T08:15:00'), endsAt: null };
    const next = taskDraftFromInput(input);
    expect(next?.frame).toEqual(timedAt('2031-06-10', 8 * 60 + 15));
    expect(next && taskTimesAt(next, next.frame)).toEqual(input);
  });

  it('終日は開始の日 1 日の枠になる', () => {
    const next = taskDraftFromInput({
      allDay: true,
      startsAt: iso('2031-06-10T00:00:00'),
      endsAt: null,
    });
    expect(next?.frame).toEqual(allDay('2031-06-10', '2031-06-10'));
    expect(next && taskTimesAt(next, next.frame)).toEqual({
      allDay: true,
      startsAt: iso('2031-06-10T00:00:00'),
      endsAt: null,
    });
  });

  it('開始が空なら枠に置けない', () => {
    expect(taskDraftFromInput({ allDay: true, startsAt: null, endsAt: null })).toBeNull();
  });
});

describe('newTaskTimes', () => {
  it('予定の枠の開始の所にタスクを置く（枠はタスクの形）', () => {
    const next = newTaskTimes({ allDay: false, date: DAY, startMin: 9 * 60, endMin: 11 * 60 });
    expect(next.frame).toEqual(timedAt(DAY, 9 * 60));
    expect(taskTimesAt(next, next.frame)).toEqual({
      allDay: false,
      startsAt: iso('2031-06-05T09:00:00'),
      endsAt: null,
    });
  });

  it('複数日の終日の予定からは、最初の日を開始日にした日だけのタスク', () => {
    const next = newTaskTimes(allDay('2031-06-05', '2031-06-07'));
    expect(next.frame).toEqual(allDay(DAY, DAY));
    expect(taskTimesAt(next, next.frame)).toEqual({
      allDay: true,
      startsAt: iso('2031-06-05T00:00:00'),
      endsAt: null,
    });
  });

  it('動かすと開始が付いてくる', () => {
    const next = newTaskTimes(allDay(DAY, DAY));
    expect(taskTimesAt(next, timedAt('2031-06-06', 20 * 60))).toEqual({
      allDay: false,
      startsAt: iso('2031-06-06T20:00:00'),
      endsAt: null,
    });
  });
});

describe('taskDraftText', () => {
  it('開始。終日は日付だけ', () => {
    expect(taskDraftText(taskDraftValues(task, timedAt(DAY, 600)))).toBe('開始 6/5(木) 10:00');
    expect(taskDraftText(allDayTask)).toBe('開始 6/5(木)');
  });
});
