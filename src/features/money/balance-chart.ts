import type { DefaultLabelFormatterCallbackParams } from 'echarts';
import type { LineSeriesOption } from 'echarts/charts';
import type {
  AriaComponentOption,
  DataZoomComponentOption,
  GridComponentOption,
  LegendComponentOption,
  TooltipComponentOption,
} from 'echarts/components';
import { type ComposeOption, format } from 'echarts/core';
import { addCalendarMonths, startOfDate, toDateString } from '../../../shared/date.ts';
import { BALANCE_WINDOW_MONTHS, type MoneyBalance } from '../../../shared/money.ts';
import type { DateString } from '../../../shared/types.ts';
import { formatDateWithYear, formatMonthDay } from '../../lib/date.ts';
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

/** グラフの設定（ECharts の option）。使う部品の分だけの型 */
export type ChartOption = ComposeOption<
  | LineSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | DataZoomComponentOption
  | LegendComponentOption
  | AriaComponentOption
>;

/** 縮めて出せる最も短い期間（1 週間） */
const MIN_SPAN = 7 * 24 * 60 * 60 * 1000;

/** 期間の操作 */
const DATA_ZOOM: DataZoomComponentOption = {
  type: 'inside',
  filterMode: 'filter',
  minValueSpan: MIN_SPAN,
};

/** option に出している期間を添える（`useECharts` が option を当てるとき） */
export function withWindow(option: ChartOption, { start, end }: ChartWindow): ChartOption {
  return { ...option, dataZoom: [{ ...DATA_ZOOM, startValue: start, endValue: end }] };
}

/** 選んだ口座の推移を積み上げた、塗りつぶし付きの折れ線グラフの設定（期間は `withWindow` で添える） */
export function chartOption(
  balances: readonly MoneyBalance[],
  accounts: readonly string[],
  selected: readonly string[],
  axis: ChartWindow,
): ChartOption {
  return {
    backgroundColor: 'transparent',
    animation: false,
    aria: { enabled: true },
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    legend: {
      show: false,
      selected: Object.fromEntries(accounts.map((name) => [name, selected.includes(name)])),
    },
    tooltip: {
      // 既定でマウスを乗せたとき・押したとき（スマホのタップ）の両方で出る
      trigger: 'axis',
      formatter: (params) => tooltipText(Array.isArray(params) ? params : [params]),
    },
    xAxis: {
      type: 'time',
      min: axis.start,
      max: axis.end,
      axisLabel: {
        formatter: { year: '{yyyy}年', month: '{M}月', day: '{M}/{d}' },
        hideOverlap: true,
      },
    },
    yAxis: {
      type: 'value',
      min: (value) => axisRange(value.min, value.max).min,
      max: (value) => axisRange(value.min, value.max).max,
      // 上下の端は余白を足した中途半端な値なので、目盛りの数字は出さない（きりのよい目盛りとくっついて読みにくい）
      axisLabel: { formatter: formatAxisYen, showMinLabel: false, showMaxLabel: false },
    },
    series: toSeries(balances, accounts).map(({ account, points }) => ({
      type: 'line',
      name: account,
      stack: 'balance',
      areaStyle: {},
      showSymbol: false,
      data: points,
    })),
  };
}

/** 押した日の日付と、口座ごとの金額（2 つ以上なら合計も）。点はどれも [時刻, 金額]（`toSeries`） */
function tooltipText(params: DefaultLabelFormatterCallbackParams[]): string {
  const point = (param: DefaultLabelFormatterCallbackParams) =>
    param.value as [number, number | null];
  const rows = params.flatMap((param) => {
    const [, amount] = point(param);
    const label = `${param.marker}${format.encodeHTML(param.seriesName ?? '')}`;
    return amount === null ? [] : [{ label, amount }];
  });
  const [first] = params;
  return [
    ...(first ? [formatDateWithYear(new Date(point(first)[0]))] : []),
    ...rows.map((row) => `${row.label} ${formatYen(row.amount)}`),
    ...(rows.length > 1
      ? [`合計 ${formatYen(rows.reduce((sum, row) => sum + row.amount, 0))}`]
      : []),
  ].join('<br>');
}
