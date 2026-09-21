import { describe, expect, it } from 'vitest';
import { dragRange } from '../use-time-drag.ts';

// 1 時間 60px（= 15 分の枠が 15px）で考える
const HOUR = 60;

describe('dragRange', () => {
  it('下向きのドラッグは触れた枠をすべて含む', () => {
    expect(dragRange(9 * HOUR, 10 * HOUR + 1, HOUR)).toEqual({ startMin: 540, endMin: 615 });
  });

  it('上向きのドラッグも同じ時間帯になる', () => {
    expect(dragRange(10 * HOUR + 1, 9 * HOUR, HOUR)).toEqual({ startMin: 540, endMin: 615 });
  });

  it('15 分の枠に吸着する', () => {
    expect(dragRange(9 * HOUR + 14, 9 * HOUR + 31, HOUR)).toEqual({ startMin: 540, endMin: 585 });
  });

  it('動かさずに離したときは最短の時間帯', () => {
    expect(dragRange(9 * HOUR, 9 * HOUR, HOUR)).toEqual({ startMin: 540, endMin: 570 });
  });

  it('時間軸の外に出ても 0:00〜24:00 に収まる', () => {
    expect(dragRange(-100, 0, HOUR)).toEqual({ startMin: 0, endMin: 30 });
    expect(dragRange(24 * HOUR + 100, 23 * HOUR, HOUR)).toEqual({ startMin: 1380, endMin: 1440 });
    expect(dragRange(24 * HOUR + 100, 24 * HOUR + 100, HOUR)).toEqual({
      startMin: 1410,
      endMin: 1440,
    });
  });
});
