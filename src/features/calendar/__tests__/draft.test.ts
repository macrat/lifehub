import { describe, expect, it } from 'vitest';
import type { DateString } from '../../../../shared/types.ts';
import {
  dayDraft,
  defaultDraft,
  draftColumns,
  draftText,
  type TimePoint,
  timeDraft,
} from '../draft.ts';

const DAY = '2031-06-05' as DateString;
const at = (minutes: number): TimePoint => ({ date: DAY, min: minutes });

describe('timeDraft', () => {
  it('動かさずに離したときは押した枠から 1 時間', () => {
    expect(timeDraft(at(9 * 60 + 5), at(9 * 60 + 5), false)).toEqual({
      allDay: false,
      date: DAY,
      startMin: 540,
      endMin: 600,
    });
  });

  it('下向きのドラッグは触れた枠をすべて含む', () => {
    expect(timeDraft(at(9 * 60), at(10 * 60 + 1), true)).toMatchObject({
      startMin: 540,
      endMin: 615,
    });
  });

  it('上向きのドラッグも同じ時間帯になる', () => {
    expect(timeDraft(at(10 * 60 + 1), at(9 * 60), true)).toMatchObject({
      startMin: 540,
      endMin: 615,
    });
  });

  it('15 分の枠に吸着する', () => {
    expect(timeDraft(at(9 * 60 + 14), at(9 * 60 + 31), true)).toMatchObject({
      startMin: 540,
      endMin: 585,
    });
  });

  it('ドラッグが同じ枠に収まるときは最短の時間帯', () => {
    expect(timeDraft(at(9 * 60), at(9 * 60 + 5), true)).toMatchObject({
      startMin: 540,
      endMin: 570,
    });
  });

  it('日は始点のもの（列をまたいでも変わらない）', () => {
    expect(
      timeDraft(at(9 * 60), { date: '2031-06-06' as DateString, min: 10 * 60 }, true),
    ).toMatchObject({
      date: DAY,
    });
  });

  it('時間軸の外に出ても 0:00〜24:00 に収まる', () => {
    expect(timeDraft(at(-100), at(0), true)).toMatchObject({ startMin: 0, endMin: 30 });
    expect(timeDraft(at(25 * 60), at(23 * 60), true)).toMatchObject({
      startMin: 1380,
      endMin: 1440,
    });
    expect(timeDraft(at(25 * 60), at(25 * 60), false)).toMatchObject({
      startMin: 1410,
      endMin: 1440,
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
    expect(draftColumns(timeDraft(at(540), at(540), false), week)).toBeNull();
  });
});

describe('draftText', () => {
  it('時間指定は日付と時間帯', () => {
    expect(draftText(timeDraft(at(15 * 60), at(16 * 60), true))).toBe('6/5(木) 15:00〜16:15');
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
