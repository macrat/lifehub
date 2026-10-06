import { LineChart, type LineSeriesOption } from 'echarts/charts';
import {
  AriaComponent,
  type AriaComponentOption,
  type DataZoomComponentOption,
  DataZoomInsideComponent,
  GridComponent,
  type GridComponentOption,
  LegendComponent,
  type LegendComponentOption,
  TooltipComponent,
  type TooltipComponentOption,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useMemo, useRef } from 'react';
import type { MoneyBalance } from '../../../../shared/money.ts';
import { formatDateWithYear } from '../../../lib/date.ts';
import { useColorMode } from '../../../lib/theme.ts';
import { formatYen } from '../../../lib/yen.ts';
import { axisRange, type ChartWindow, formatAxisYen, toSeries } from '../balance-chart.ts';
import type { BalanceChartState } from '../use-balance-chart.ts';

// 使う部品だけを読み込む（ECharts 全体は大きい。この画面のチャンクにだけ入る）
echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  DataZoomInsideComponent,
  LegendComponent,
  AriaComponent,
  CanvasRenderer,
]);

type ChartOption = echarts.ComposeOption<
  | LineSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | DataZoomComponentOption
  | LegendComponentOption
  | AriaComponentOption
>;

/** 縮めて出せる最も短い期間（1 週間） */
const MIN_SPAN = 7 * 24 * 60 * 60 * 1000;

type Props = {
  balances: readonly MoneyBalance[];
  /** 口座の並び（環境変数の順）。積み上げの順と色はこの順で決まり、選ぶ口座を変えても同じ口座は同じ色 */
  accounts: readonly string[];
  /** 出す口座 */
  selected: readonly string[];
  state: BalanceChartState;
};

/**
 * 残高の推移の、塗りつぶし付きの折れ線グラフ（ECharts）。選んだ口座を積み上げる。
 * - ピンチ・ホイールで期間を拡大縮小し、ドラッグで前後へ動かす（dataZoom の inside）
 * - 縦軸は出している期間の値の最小と最大から少し広げた範囲（`axisRange`。dataZoom の filter で期間の外の値は除いて測る）
 * - グラフのどこかを押す・マウスを乗せると、その日の日付と金額（2 つ以上なら合計も）が出る
 * 口座はすべて系列として持ち、出さない口座は凡例の選択で隠す（系列の順が変わらないので、色が口座ごとに決まる）。
 */
export function BalanceChart({ balances, accounts, selected, state }: Props) {
  const mode = useColorMode();
  const { window, axisStart, onWindowChange } = state;
  const option = useMemo(
    () => chartOption(balances, accounts, selected, window, axisStart),
    [balances, accounts, selected, window, axisStart],
  );
  const ref = useECharts(mode, option, onWindowChange);
  return <div ref={ref} style={{ height: '100%' }} />;
}

/**
 * ECharts を div に描く。色の向き（mode）が変わったら作り直し、大きさは要素の大きさに合わせ続ける。
 * option が変わったら差分を当てる。期間の操作（dataZoom）で変わった期間を onWindowChange に渡す。
 * WHY NOT echarts-for-react: CommonJS だけで配られていて、Vite の本番の束ねでは default の読み込みが部品にならない。
 * 要るのは作る・合わせる・捨てるだけなので、ECharts の API を直に呼ぶ。
 */
function useECharts(
  mode: 'light' | 'dark',
  option: ChartOption,
  onWindowChange: (window: ChartWindow) => void,
) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const onChange = useRef(onWindowChange);
  onChange.current = onWindowChange;
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const instance = echarts.init(element, mode === 'dark' ? 'dark' : undefined);
    chart.current = instance;
    instance.on('datazoom', () => {
      const [zoom] = (instance.getOption() as ChartOption).dataZoom as {
        startValue: number;
        endValue: number;
      }[];
      if (zoom) onChange.current({ start: zoom.startValue, end: zoom.endValue });
    });
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(element);
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, [mode]);
  // 作り直した後にも当てる（mode の変化で、option は同じまま描き直す）
  // biome-ignore lint/correctness/useExhaustiveDependencies: mode は作り直しの合図
  useEffect(() => {
    chart.current?.setOption(option);
  }, [option, mode]);
  return ref;
}

function chartOption(
  balances: readonly MoneyBalance[],
  accounts: readonly string[],
  selected: readonly string[],
  window: ChartWindow,
  axisStart: number,
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
      min: axisStart,
      max: window.end > Date.now() ? window.end : Date.now(),
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
    dataZoom: [
      {
        type: 'inside',
        filterMode: 'filter',
        startValue: window.start,
        endValue: window.end,
        minValueSpan: MIN_SPAN,
      },
    ],
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

/** 押した日の日付と、口座ごとの金額（2 つ以上なら合計も） */
function tooltipText(
  params: { axisValue?: unknown; marker?: unknown; seriesName?: string; value?: unknown }[],
): string {
  const rows = params.flatMap((param) => {
    const amount = (param.value as [number, number | null] | undefined)?.[1];
    return amount === null || amount === undefined
      ? []
      : [{ label: `${param.marker ?? ''}${escapeHtml(param.seriesName ?? '')}`, amount }];
  });
  const day = params[0]?.axisValue;
  const lines = [
    typeof day === 'number' ? formatDateWithYear(new Date(day)) : '',
    ...rows.map((row) => `${row.label} ${formatYen(row.amount)}`),
    ...(rows.length > 1
      ? [`合計 ${formatYen(rows.reduce((sum, row) => sum + row.amount, 0))}`]
      : []),
  ];
  return lines.join('<br>');
}

/** 口座の名前を HTML に差し込むので、タグにならないようにする（ECharts の tooltip は HTML で描く） */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
