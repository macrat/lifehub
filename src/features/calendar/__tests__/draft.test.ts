import { describe, expect, it } from 'vitest';
import type { CalendarItem } from '../../../../shared/calendar.ts';
import type { DateString } from '../../../../shared/types.ts';
import {
  type AllDayDraft,
  type DayGrab,
  dayDraft,
  dayGrab,
  dayVibration,
  defaultDraft,
  draftColumns,
  draftText,
  draftValues,
  type TimedDraft,
  type TimeGrab,
  type TimePoint,
  timeDraft,
  timeVibration,
} from '../draft.ts';

const DAY = '2031-06-05' as DateString;
const at = (minutes: number): TimePoint => ({ date: DAY, min: minutes });
/** 空いている所を from → to へなぞる（moved を省くとその場で離したタップ・クリック） */
const select = (from: TimePoint, to: TimePoint, moved = false) =>
  timeDraft({ grab: null, from, to, moved });
/** 下書きを kind の所でつまんで from → to へ動かす（追加の下書きなので直す予定は無い） */
const grabbed = (draft: TimedDraft, kind: TimeGrab['kind'], from: TimePoint, to: TimePoint) =>
  timeDraft({ grab: { kind, draft, item: null }, from, to, moved: true });

const allDay = (from: string, to: string): AllDayDraft => ({
  allDay: true,
  from: from as DateString,
  to: to as DateString,
});
const day = (date: string) => date as DateString;
/** 時間指定の下書き（日の並びでは 1 日ぶんの帯になる） */
const timed = select(at(9 * 60), at(10 * 60), true);
/** 空いている所を from → to へなぞる */
const selectDays = (from: string, to: string) =>
  dayDraft({ grab: null, from: day(from), to: day(to), moved: true });
/** 下書きをつまんで from → to へ動かす（moved を省くとつまんだだけで動かしていない） */
const draggedDays = (grab: DayGrab, from: string, to: string, moved = true) =>
  dayDraft({ grab, from: day(from), to: day(to), moved });

describe('timeDraft', () => {
  it('動かさずに離したときは押した枠から 1 時間', () => {
    expect(select(at(9 * 60 + 5), at(9 * 60 + 5))).toEqual({
      allDay: false,
      date: DAY,
      startMin: 540,
      endMin: 600,
    });
  });

  it('下向きのドラッグは触れた枠をすべて含む', () => {
    expect(select(at(9 * 60), at(10 * 60 + 1), true)).toMatchObject({
      startMin: 540,
      endMin: 615,
    });
  });

  it('上向きのドラッグも同じ時間帯になる', () => {
    expect(select(at(10 * 60 + 1), at(9 * 60), true)).toMatchObject({
      startMin: 540,
      endMin: 615,
    });
  });

  it('15 分の枠に吸着する', () => {
    expect(select(at(9 * 60 + 14), at(9 * 60 + 31), true)).toMatchObject({
      startMin: 540,
      endMin: 585,
    });
  });

  it('ドラッグが同じ枠に収まるときは最短の時間帯', () => {
    expect(select(at(9 * 60), at(9 * 60 + 5), true)).toMatchObject({
      startMin: 540,
      endMin: 570,
    });
  });

  it('日は始点のもの（列をまたいでも変わらない）', () => {
    expect(
      select(at(9 * 60), { date: '2031-06-06' as DateString, min: 10 * 60 }, true),
    ).toMatchObject({
      date: DAY,
    });
  });

  it('時間軸の外に出ても 0:00〜24:00 に収まる', () => {
    expect(select(at(-100), at(0), true)).toMatchObject({ startMin: 0, endMin: 30 });
    expect(select(at(25 * 60), at(23 * 60), true)).toMatchObject({
      startMin: 1380,
      endMin: 1440,
    });
    expect(select(at(25 * 60), at(25 * 60))).toMatchObject({
      startMin: 1410,
      endMin: 1440,
    });
  });
});

describe('timeDraft（下書きをつまむ）', () => {
  const draft: TimedDraft = { allDay: false, date: DAY, startMin: 9 * 60, endMin: 10 * 60 };

  it('つまんだだけで動かしていなければそのまま', () => {
    expect(
      timeDraft({
        grab: { kind: 'move', draft, item: null },
        from: at(9 * 60),
        to: at(12 * 60),
        moved: false,
      }),
    ).toEqual(draft);
  });

  it('開始をつまむと終了は動かず、近い 15 分に吸着する', () => {
    expect(grabbed(draft, 'start', at(9 * 60), at(8 * 60 + 22))).toMatchObject({
      startMin: 8 * 60 + 15,
      endMin: 10 * 60,
    });
  });

  it('開始は終了の 15 分前より後ろへ行けない', () => {
    expect(grabbed(draft, 'start', at(9 * 60), at(10 * 60))).toMatchObject({
      startMin: 9 * 60 + 45,
      endMin: 10 * 60,
    });
    expect(grabbed(draft, 'start', at(9 * 60), at(23 * 60))).toMatchObject({
      startMin: 9 * 60 + 45,
      endMin: 10 * 60,
    });
  });

  it('終了をつまむと開始は動かず、近い 15 分に吸着する', () => {
    expect(grabbed(draft, 'end', at(10 * 60), at(11 * 60 + 38))).toMatchObject({
      startMin: 9 * 60,
      endMin: 11 * 60 + 45,
    });
  });

  it('終了は開始の 15 分後より前へ行けない', () => {
    expect(grabbed(draft, 'end', at(10 * 60), at(9 * 60))).toMatchObject({
      startMin: 9 * 60,
      endMin: 9 * 60 + 15,
    });
    expect(grabbed(draft, 'end', at(10 * 60), at(0))).toMatchObject({
      startMin: 9 * 60,
      endMin: 9 * 60 + 15,
    });
  });

  it('枠をつまむと長さを保ったまま動く（動かした分だけ）', () => {
    expect(grabbed(draft, 'move', at(9 * 60 + 30), at(11 * 60 + 33))).toMatchObject({
      startMin: 11 * 60,
      endMin: 12 * 60,
    });
    expect(grabbed(draft, 'move', at(9 * 60 + 30), at(8 * 60 + 20))).toMatchObject({
      startMin: 7 * 60 + 45,
      endMin: 8 * 60 + 45,
    });
  });

  it('枠は長さを保ったまま 0:00〜24:00 に収まる', () => {
    expect(grabbed(draft, 'move', at(9 * 60 + 30), at(-3 * 60))).toMatchObject({
      startMin: 0,
      endMin: 60,
    });
    expect(grabbed(draft, 'move', at(9 * 60 + 30), at(30 * 60))).toMatchObject({
      startMin: 23 * 60,
      endMin: 24 * 60,
    });
  });

  it('枠は左右に動かすと指の下の列の日に移る（長さも時間帯も保つ）', () => {
    expect(
      grabbed(draft, 'move', at(9 * 60 + 30), {
        date: '2031-06-06' as DateString,
        min: 9 * 60 + 30,
      }),
    ).toEqual({ allDay: false, date: '2031-06-06', startMin: 9 * 60, endMin: 10 * 60 });
  });

  it('端の丸は日を変えない（列をまたいでも）', () => {
    const next = '2031-06-06' as DateString;
    expect(grabbed(draft, 'start', at(9 * 60), { date: next, min: 8 * 60 })).toMatchObject({
      date: DAY,
    });
    expect(grabbed(draft, 'end', at(10 * 60), { date: next, min: 11 * 60 })).toMatchObject({
      date: DAY,
    });
  });
});

describe('dayDraft', () => {
  it('両端を含む期間になる', () => {
    expect(selectDays('2031-06-05', '2031-06-07')).toEqual(allDay('2031-06-05', '2031-06-07'));
  });

  it('遡ってドラッグしても同じ期間になる', () => {
    expect(selectDays('2031-06-07', '2031-06-05')).toEqual(allDay('2031-06-05', '2031-06-07'));
  });

  it('動かさずに離したときは押した日だけの期間', () => {
    expect(dayDraft({ grab: null, from: day(DAY), to: day(DAY), moved: false })).toEqual(
      allDay(DAY, DAY),
    );
  });
});

describe('dayGrab', () => {
  const draft = allDay('2031-06-05', '2031-06-07');

  it('最初の日の左半分は開始、最後の日の右半分は終了', () => {
    expect(dayGrab(draft, day('2031-06-05'), 'left')).toEqual({ kind: 'start', draft });
    expect(dayGrab(draft, day('2031-06-07'), 'right')).toEqual({ kind: 'end', draft });
  });

  it('それ以外の掛かっている所は帯そのもの', () => {
    expect(dayGrab(draft, day('2031-06-05'), 'right')).toEqual({ kind: 'move', draft });
    expect(dayGrab(draft, day('2031-06-06'), 'left')).toEqual({ kind: 'move', draft });
    expect(dayGrab(draft, day('2031-06-07'), 'left')).toEqual({ kind: 'move', draft });
  });

  it('1 日だけの下書きは左右の半分が開始・終了になる（中ほどは無い）', () => {
    const single = allDay(DAY, DAY);
    expect(dayGrab(single, DAY, 'left')).toEqual({ kind: 'start', draft: single });
    expect(dayGrab(single, DAY, 'right')).toEqual({ kind: 'end', draft: single });
  });

  it('時間指定の下書きは、その日のどこを押しても帯そのもの（時間帯は日の並びでは直せない）', () => {
    expect(dayGrab(timed, DAY, 'left')).toEqual({ kind: 'move', draft: timed });
    expect(dayGrab(timed, DAY, 'right')).toEqual({ kind: 'move', draft: timed });
    expect(dayGrab(timed, day('2031-06-06'), 'left')).toBeNull();
  });

  it('掛からない日・下書き無しは掴まない', () => {
    expect(dayGrab(draft, day('2031-06-04'), 'right')).toBeNull();
    expect(dayGrab(draft, day('2031-06-08'), 'left')).toBeNull();
    expect(dayGrab(null, DAY, 'left')).toBeNull();
  });
});

describe('dayDraft（下書きをつまむ）', () => {
  const draft = allDay('2031-06-05', '2031-06-07');

  it('つまんだだけで動かしていなければそのまま', () => {
    expect(draggedDays({ kind: 'move', draft }, DAY, '2031-06-09', false)).toEqual(draft);
  });

  it('開始をつまむと終了は動かない', () => {
    expect(draggedDays({ kind: 'start', draft }, '2031-06-05', '2031-06-03')).toEqual(
      allDay('2031-06-03', '2031-06-07'),
    );
  });

  it('開始は終了より後ろへ行けない（最短 1 日）', () => {
    expect(draggedDays({ kind: 'start', draft }, '2031-06-05', '2031-06-09')).toEqual(
      allDay('2031-06-07', '2031-06-07'),
    );
  });

  it('終了をつまむと開始は動かない', () => {
    expect(draggedDays({ kind: 'end', draft }, '2031-06-07', '2031-06-10')).toEqual(
      allDay('2031-06-05', '2031-06-10'),
    );
  });

  it('終了は開始より前へ行けない（最短 1 日）', () => {
    expect(draggedDays({ kind: 'end', draft }, '2031-06-07', '2031-06-01')).toEqual(
      allDay('2031-06-05', '2031-06-05'),
    );
  });

  it('帯そのものをつまむと日数を保ったまま動かした日数だけずれる', () => {
    expect(draggedDays({ kind: 'move', draft }, '2031-06-06', '2031-06-09')).toEqual(
      allDay('2031-06-08', '2031-06-10'),
    );
    expect(draggedDays({ kind: 'move', draft }, '2031-06-06', '2031-06-04')).toEqual(
      allDay('2031-06-03', '2031-06-05'),
    );
  });

  it('月グリッドで下の行へ動かすと 1 週間ぶんずれる', () => {
    expect(draggedDays({ kind: 'move', draft }, '2031-06-06', '2031-06-13')).toEqual(
      allDay('2031-06-12', '2031-06-14'),
    );
  });

  it('時間指定の下書きは時間帯を保ったまま日だけが動く', () => {
    expect(draggedDays({ kind: 'move', draft: timed }, DAY, '2031-06-12')).toEqual({
      ...timed,
      date: '2031-06-12',
    });
  });
});

describe('draftColumns', () => {
  const week = ['2031-06-02', '2031-06-03', '2031-06-04', '2031-06-05'] as DateString[];

  it('並んだ日のうち掛かっている列を返す', () => {
    const draft = allDay('2031-06-03', '2031-06-04');
    expect(draftColumns(draft, week)).toEqual({
      col: 1,
      span: 2,
      roundStart: true,
      roundEnd: true,
    });
  });

  it('表示の外にはみ出す分は切り詰める', () => {
    const draft = allDay('2031-05-30', '2031-06-03');
    // 前の週から続いている端は丸めない
    expect(draftColumns(draft, week)).toEqual({
      col: 0,
      span: 2,
      roundStart: false,
      roundEnd: true,
    });
  });

  it('時間指定の下書きはその日 1 日ぶんの列', () => {
    expect(draftColumns(select(at(540), at(540)), week)).toEqual({
      col: 3,
      span: 1,
      roundStart: true,
      roundEnd: true,
    });
  });

  it('掛からない週は null', () => {
    expect(draftColumns(allDay('2031-07-01', '2031-07-01'), week)).toBeNull();
    expect(
      draftColumns(select({ date: '2031-07-01' as DateString, min: 540 }, at(540)), week),
    ).toBeNull();
  });
});

describe('draftText', () => {
  it('時間指定は日付と時間帯', () => {
    expect(draftText(select(at(15 * 60), at(16 * 60), true))).toBe('6/5(木) 15:00〜16:15');
  });

  it('終日は日付（複数日なら両端）と「終日」', () => {
    expect(draftText(allDay(DAY, DAY))).toBe('6/5(木) 終日');
    expect(draftText(allDay(DAY, '2031-06-07'))).toBe('6/5(木)〜6/7(土) 終日');
  });
});

describe('defaultDraft', () => {
  const jst = (s: string) => new Date(`${s}+09:00`);

  it('現在時刻の分を切り上げた正時から 1 時間', () => {
    expect(defaultDraft(DAY, jst('2026-09-21T17:11:00'))).toEqual({
      allDay: false,
      date: DAY,
      startMin: 18 * 60,
      endMin: 19 * 60,
    });
  });

  it('ちょうど正時なら切り上げない', () => {
    expect(defaultDraft(DAY, jst('2026-09-21T17:00:00'))).toMatchObject({ startMin: 17 * 60 });
  });

  it('切り上げが日をまたぐときは、枠に出せる最後の 1 時間にする', () => {
    expect(defaultDraft(DAY, jst('2026-09-21T23:30:00'))).toMatchObject({
      startMin: 23 * 60,
      endMin: 24 * 60,
    });
  });
});

describe('timeVibration', () => {
  const draft = (startMin: number, endMin: number): TimedDraft => ({
    allDay: false,
    date: DAY,
    startMin,
    endMin,
  });

  it('動いていなければ震わせない', () => {
    expect(timeVibration(draft(540, 600), draft(540, 600))).toBeNull();
  });

  it('開始が正時になったら長く、15 分刻みなら短く震わせる', () => {
    expect(timeVibration(draft(555, 600), draft(540, 600))).toBe(50);
    expect(timeVibration(draft(540, 600), draft(555, 600))).toBe(10);
  });

  it('終了が動いたときは終了時刻で決まる', () => {
    expect(timeVibration(draft(540, 615), draft(540, 600))).toBe(50);
    expect(timeVibration(draft(540, 600), draft(540, 615))).toBe(10);
  });

  it('枠ごと動いて両方変わるときは開始時刻が基準', () => {
    expect(timeVibration(draft(540, 615), draft(555, 630))).toBe(10);
    expect(timeVibration(draft(555, 630), draft(600, 675))).toBe(50);
  });
});

describe('dayVibration', () => {
  it('選ぶ日が変わっていなければ震わせない', () => {
    expect(
      dayVibration(allDay('2031-06-05', '2031-06-06'), allDay('2031-06-05', '2031-06-06')),
    ).toBeNull();
  });

  it('日をまたいで端が動いたら震わせる', () => {
    expect(
      dayVibration(allDay('2031-06-05', '2031-06-05'), allDay('2031-06-05', '2031-06-06')),
    ).toBe(10);
    expect(
      dayVibration(allDay('2031-06-05', '2031-06-06'), allDay('2031-06-05', '2031-06-05')),
    ).toBe(10);
  });

  it('向きが変わって起点の側が動いたときも震わせる', () => {
    expect(
      dayVibration(allDay('2031-06-05', '2031-06-05'), allDay('2031-06-04', '2031-06-05')),
    ).toBe(10);
  });

  it('帯ごと動かしたときも、時間指定の下書きの日が変わったときも震わせる', () => {
    expect(
      dayVibration(allDay('2031-06-05', '2031-06-06'), allDay('2031-06-12', '2031-06-13')),
    ).toBe(10);
    expect(dayVibration(timed, { ...timed, date: day('2031-06-06') })).toBe(10);
    expect(dayVibration(timed, { ...timed, startMin: 8 * 60 })).toBeNull();
  });
});

describe('draftValues', () => {
  const event: CalendarItem = {
    kind: 'event',
    id: 'e1',
    title: '打ち合わせ',
    allDay: false,
    startsAt: '2031-06-05T00:00:00.000Z',
    endsAt: '2031-06-05T01:00:00.000Z',
    completedAt: null,
    location: '会議室',
    note: 'メモ',
    participantIds: ['u1'],
    rrule: 'FREQ=WEEKLY',
    remindStartMinutes: 10,
    remindEndMinutes: null,
    occurrenceStart: '2031-06-05T00:00:00.000Z',
    isRecurring: true,
    isModified: false,
    placementDate: DAY,
    dayIndex: 1,
    dayCount: 1,
  };

  it('追加のときは日時と参加者だけの空の予定', () => {
    expect(draftValues(timed, ['u1'])).toMatchObject({
      title: '',
      allDay: false,
      // `timed` は 9:00〜10:15（なぞって触れた 15 分の枠まで含む）
      startsAt: '2031-06-05T00:00:00.000Z',
      endsAt: '2031-06-05T01:15:00.000Z',
      participantIds: ['u1'],
      location: null,
      rrule: null,
    });
  });

  it('直している予定があるときは、その内容に枠の日時と参加者だけを重ねる', () => {
    expect(
      draftValues({ ...timed, startMin: 13 * 60, endMin: 14 * 60 }, ['u2'], event),
    ).toMatchObject({
      title: '打ち合わせ',
      location: '会議室',
      note: 'メモ',
      rrule: 'FREQ=WEEKLY',
      remindStartMinutes: 10,
      allDay: false,
      startsAt: '2031-06-05T04:00:00.000Z',
      endsAt: '2031-06-05T05:00:00.000Z',
      participantIds: ['u2'],
    });
  });

  it('終日にすると日だけの日時になる（直している内容はそのまま）', () => {
    expect(draftValues(allDay('2031-06-05', '2031-06-06'), ['u1'], event)).toMatchObject({
      title: '打ち合わせ',
      allDay: true,
      // 終日の終わりは翌日 0:00（JST）
      startsAt: '2031-06-04T15:00:00.000Z',
      endsAt: '2031-06-06T15:00:00.000Z',
    });
  });
});
