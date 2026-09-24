import { describe, expect, it } from 'vitest';
import type { DateString } from '../../../../shared/types.ts';
import { type TimedDraft, timeDraft, timeVibration } from '../draft.ts';
import { at, DAY, grabbed, select } from './draft-fixtures.ts';

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
