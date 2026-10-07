import { describe, expect, it } from 'vitest';
import { startOfDate } from '../../../../shared/date.ts';
import type { MoneyBalance } from '../../../../shared/money.ts';
import { dateStringSchema } from '../../../../shared/validation/common.ts';
import {
  axisRange,
  defaultWindow,
  formatAxisYen,
  formatWindow,
  needsEarlier,
  toSeries,
} from '../balance-chart.ts';

const day = (date: string) => dateStringSchema.parse(date);
const at = (date: string) => startOfDate(day(date)).getTime();
const balance = (account: string, on: string, amount: number): MoneyBalance => ({
  account,
  on: day(on),
  amount,
});

describe('残高の推移のグラフ', () => {
  it('最初は今日までの過去 3 か月を出し、AppBar には年をまたがなければ年を 1 つだけ書く', () => {
    const window = defaultWindow(day('2026-10-06'));
    expect(window).toEqual({ start: at('2026-07-06'), end: at('2026-10-06') });
    expect(formatWindow(window)).toBe('2026/7/6 〜 10/6');
    expect(formatWindow({ start: at('2025-12-01'), end: at('2026-03-01') })).toBe(
      '2025/12/1 〜 2026/3/1',
    );
  });

  it('口座ごとの推移は同じ日の並びを持ち、記録の無い日は前の日の値、最初の記録より前は null', () => {
    const series = toSeries(
      [
        balance('銀行', '2026-10-01', 100),
        balance('カード', '2026-10-02', 5),
        balance('銀行', '2026-10-03', 120),
        balance('カード', '2026-10-03', 7),
      ],
      ['銀行', 'カード'],
    );
    expect(series).toEqual([
      {
        account: '銀行',
        points: [
          [at('2026-10-01'), 100],
          [at('2026-10-02'), 100],
          [at('2026-10-03'), 120],
        ],
      },
      {
        account: 'カード',
        points: [
          [at('2026-10-01'), null],
          [at('2026-10-02'), 5],
          [at('2026-10-03'), 7],
        ],
      },
    ]);
  });

  it('縦軸は出している期間の最小と最大から 1 割ずつ広げてきりのよい値にし、正の値なら 0 を下回らず、負の値なら 0 を上回らない', () => {
    expect(axisRange(1_000_000, 1_300_000)).toEqual({ min: 970_000, max: 1_330_000 });
    expect(axisRange(10_000, 1_000_000)).toEqual({ min: 0, max: 1_100_000 });
    expect(axisRange(-50_000, 50_000)).toEqual({ min: -60_000, max: 60_000 });
    // カードの負債だけなら上端は 0 を超えない
    expect(axisRange(-50_000, -10_000)).toEqual({ min: -54_000, max: -6_000 });
    expect(axisRange(-1_000_000, -10_000)).toEqual({ min: -1_100_000, max: 0 });
    // 値が 1 つだけでも幅を持たせる
    expect(axisRange(500_000, 500_000)).toEqual({ min: 450_000, max: 550_000 });
  });

  it('出している期間の始まりより、期間の長さの半分手前まで読んでいなければ古いほうを読み足す', () => {
    const window = { start: at('2026-07-06'), end: at('2026-10-06') };
    expect(needsEarlier(window, at('2026-07-07'))).toBe(true);
    expect(needsEarlier(window, at('2026-05-01'))).toBe(false);
    expect(needsEarlier(window, undefined)).toBe(true);
  });

  it('縦軸の目盛りは 1 万円以上を万で数える', () => {
    expect(formatAxisYen(1_250_000)).toBe('125万');
    expect(formatAxisYen(5_000)).toBe('¥5,000');
  });
});
