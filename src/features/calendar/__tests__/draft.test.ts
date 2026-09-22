import { describe, expect, it } from 'vitest';
import type { DateString } from '../../../../shared/types.ts';
import {
  dayDraft,
  dayVibration,
  defaultDraft,
  draftColumns,
  draftText,
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
/** 下書きを kind の所でつまんで from → to へ動かす */
const grabbed = (draft: TimedDraft, kind: TimeGrab['kind'], from: TimePoint, to: TimePoint) =>
  timeDraft({ grab: { kind, draft }, from, to, moved: true });

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
      timeDraft({ grab: { kind: 'move', draft }, from: at(9 * 60), to: at(12 * 60), moved: false }),
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
    expect(dayDraft('2031-06-05' as DateString, '2031-06-07' as DateString)).toEqual({
      allDay: true,
      from: '2031-06-05',
      to: '2031-06-07',
    });
  });

  it('遡ってドラッグしても同じ期間になる', () => {
    expect(dayDraft('2031-06-07' as DateString, '2031-06-05' as DateString)).toEqual({
      allDay: true,
      from: '2031-06-05',
      to: '2031-06-07',
    });
  });
});

describe('draftColumns', () => {
  const week = ['2031-06-02', '2031-06-03', '2031-06-04', '2031-06-05'] as DateString[];

  it('並んだ日のうち掛かっている列を返す', () => {
    const draft = dayDraft('2031-06-03' as DateString, '2031-06-04' as DateString);
    expect(draftColumns(draft, week)).toEqual({
      col: 1,
      span: 2,
      roundStart: true,
      roundEnd: true,
    });
  });

  it('表示の外にはみ出す分は切り詰める', () => {
    const draft = dayDraft('2031-05-30' as DateString, '2031-06-03' as DateString);
    // 前の週から続いている端は丸めない
    expect(draftColumns(draft, week)).toEqual({
      col: 0,
      span: 2,
      roundStart: false,
      roundEnd: true,
    });
  });

  it('掛からない週と時間指定の下書きは null', () => {
    expect(
      draftColumns(dayDraft('2031-07-01' as DateString, '2031-07-01' as DateString), week),
    ).toBeNull();
    expect(draftColumns(select(at(540), at(540)), week)).toBeNull();
  });
});

describe('draftText', () => {
  it('時間指定は日付と時間帯', () => {
    expect(draftText(select(at(15 * 60), at(16 * 60), true))).toBe('6/5(木) 15:00〜16:15');
  });

  it('終日は日付（複数日なら両端）と「終日」', () => {
    expect(draftText(dayDraft(DAY, DAY))).toBe('6/5(木) 終日');
    expect(draftText(dayDraft(DAY, '2031-06-07' as DateString))).toBe('6/5(木)〜6/7(土) 終日');
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

  it('開始が正時になったら短く、15 分刻みなら長く震わせる', () => {
    expect(timeVibration(draft(555, 600), draft(540, 600))).toBe(10);
    expect(timeVibration(draft(540, 600), draft(555, 600))).toBe(50);
  });

  it('終了が動いたときは終了時刻で決まる', () => {
    expect(timeVibration(draft(540, 615), draft(540, 600))).toBe(10);
    expect(timeVibration(draft(540, 600), draft(540, 615))).toBe(50);
  });

  it('枠ごと動いて両方変わるときは開始時刻が基準', () => {
    expect(timeVibration(draft(540, 615), draft(555, 630))).toBe(50);
    expect(timeVibration(draft(555, 630), draft(600, 675))).toBe(10);
  });
});

describe('dayVibration', () => {
  const day = (n: number) => `2031-06-0${n}` as DateString;

  it('選ぶ日が変わっていなければ震わせない', () => {
    expect(dayVibration(dayDraft(day(5), day(6)), dayDraft(day(5), day(6)))).toBeNull();
  });

  it('日をまたいで端が動いたら震わせる', () => {
    expect(dayVibration(dayDraft(day(5), day(5)), dayDraft(day(5), day(6)))).toBe(10);
    expect(dayVibration(dayDraft(day(5), day(6)), dayDraft(day(5), day(5)))).toBe(10);
  });

  it('向きが変わって起点の側が動いたときも震わせる', () => {
    expect(dayVibration(dayDraft(day(5), day(5)), dayDraft(day(5), day(4)))).toBe(10);
  });
});
