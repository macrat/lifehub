import { describe, expect, it } from 'vitest';
import { initialScrollTop } from '../use-timeline-scroll.ts';

/** 1 時間 60px（1 分 1px）、見えている高さ 600px（10 時間分） */
const base = { hourHeight: 60, visibleHeight: 600, nowMinutes: null, itemsSpan: null };

describe('initialScrollTop', () => {
  it('予定が収まるときは、予定の時間帯の真ん中を見えている高さの真ん中に置く', () => {
    // 12:00〜13:00 の真ん中（12:30）が 300px の所に来る
    const top = initialScrollTop({ ...base, itemsSpan: { startMin: 12 * 60, endMin: 13 * 60 } });
    expect(top + 300).toBe(12.5 * 60);
  });

  it('予定が収まらないときは、一番早い予定の 1 時間前を一番上にする', () => {
    // 6:00〜23:00 は 17 時間で、見えている 10 時間に収まらない
    expect(initialScrollTop({ ...base, itemsSpan: { startMin: 6 * 60, endMin: 23 * 60 } })).toBe(
      5 * 60,
    );
  });

  it('予定に合わせないときは、今日を含むなら現在時刻の少し上、含まないなら 7 時を一番上にする', () => {
    expect(initialScrollTop(base)).toBe(7 * 60);
    // 15:00 は一番上より下で、見えている範囲の上半分に入る
    const top = initialScrollTop({ ...base, nowMinutes: 15 * 60 });
    expect(top).toBeLessThan(15 * 60);
    expect(top + base.visibleHeight / 2).toBeGreaterThan(15 * 60);
  });

  it('0 時より上には行かない', () => {
    expect(initialScrollTop({ ...base, itemsSpan: { startMin: 0, endMin: 60 } })).toBe(0);
    expect(initialScrollTop({ ...base, nowMinutes: 10 })).toBe(0);
  });
});
