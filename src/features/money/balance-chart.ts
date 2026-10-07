import { addCalendarMonths, startOfDate, toDateString } from '../../../shared/date.ts';
import { BALANCE_WINDOW_MONTHS, type MoneyBalance } from '../../../shared/money.ts';
import type { DateString } from '../../../shared/types.ts';
import { formatMonthDay } from '../../lib/date.ts';
import { formatYen } from '../../lib/yen.ts';

/**
 * 残高の推移のグラフ（お金の画面の口座のタイルから開く）の、表示に依らない計算。グラフの部品（`BalanceChart`）は
 * ここで作った値を ECharts に渡して描くだけにする。
 */

/** グラフに出している期間（ECharts の時間軸の値。その日の 0:00 JST の時刻） */
export type ChartWindow = { start: number; end: number };

/** 最初に出す期間: 今日までの過去 3 か月 */
export function defaultWindow(day: DateString): ChartWindow {
  return {
    start: startOfDate(addCalendarMonths(day, -BALANCE_WINDOW_MONTHS)).getTime(),
    end: startOfDate(day).getTime(),
  };
}

/** 1 つの口座の推移（[時刻, 値] の並び）。値の無い所は null（その口座の最初の記録より前） */
export type BalanceSeries = { account: string; points: [number, number | null][] };

/**
 * 口座ごとの推移にする。どの口座も同じ日の並びを持たせる（ECharts は積み上げで同じ位置の点を足すので、日が揃っていないと
 * 別の日の値を足してしまう）。記録の無い日（取り込めなかった日）は、その口座の前の日の値のままとする。
 * accounts は口座の並び（環境変数の順）で、積み上げの順と色の順になる。
 */
export function toSeries(
  balances: readonly MoneyBalance[],
  accounts: readonly string[],
): BalanceSeries[] {
  const days = [...new Set(balances.map((balance) => balance.on))]
    .sort()
    .map((day) => [day, startOfDate(day).getTime()] as const);
  const byAccount = Map.groupBy(balances, (balance) => balance.account);
  return accounts.map((account) => {
    const amounts = new Map(byAccount.get(account)?.map((b) => [b.on, b.amount]));
    let last: number | null = null;
    return {
      account,
      points: days.map(([day, time]) => {
        last = amounts.get(day) ?? last;
        return [time, last];
      }),
    };
  });
}

/** 縦軸の上下に空ける余白（出している期間の値の幅に対する割合） */
const AXIS_MARGIN = 0.1;

/**
 * 縦軸の範囲。出している期間の最小と最大から、値の幅の 1 割ずつ外へ広げ、きりのよい値に丸める。
 * 値がすべて 0 以上なら下端は 0 より下に、すべて 0 以下（カードの負債だけ）なら上端は 0 より上にしない
 * （無い向きの目盛りを出さない）。
 * 値が 1 つだけ（幅が 0）なら、値の大きさの 1 割を幅とみなす。
 */
export function axisRange(min: number, max: number): { min: number; max: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
  const span = max - min || Math.abs(max) || 1;
  const margin = span * AXIS_MARGIN;
  const unit = 10 ** Math.floor(Math.log10(margin));
  const lower = Math.floor((min - margin) / unit) * unit;
  const upper = Math.ceil((max + margin) / unit) * unit;
  return {
    min: min >= 0 ? Math.max(0, lower) : lower,
    max: max <= 0 ? Math.min(0, upper) : upper,
  };
}

/** 古いほうを読み足す境目: 出している期間の始まりから、期間の長さの半分より手前まで読んでいなければ読み足す */
export function needsEarlier(window: ChartWindow, earliest: number | undefined): boolean {
  return earliest === undefined || earliest > window.start - (window.end - window.start) / 2;
}

/** 縦軸の目盛り（「120万」「¥5,000」）。1 万円以上は万で数え、狭い画面でも目盛りの幅を取りすぎない */
export function formatAxisYen(value: number): string {
  return Math.abs(value) >= 10_000
    ? `${(value / 10_000).toLocaleString('ja-JP')}万`
    : formatYen(value);
}

/** AppBar に出す期間（「2026/7/6 〜 10/6」。年をまたぐときは両方に年を付ける） */
export function formatWindow({ start, end }: ChartWindow): string {
  const year = (time: number) => toDateString(new Date(time)).slice(0, 4);
  const endYear = year(end) === year(start) ? '' : `${year(end)}/`;
  return `${year(start)}/${formatMonthDay(new Date(start))} 〜 ${endYear}${formatMonthDay(new Date(end))}`;
}
