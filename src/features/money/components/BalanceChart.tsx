import type { DefaultLabelFormatterCallbackParams } from 'echarts';
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
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MoneyBalance } from '../../../../shared/money.ts';
import { formatDateWithYear } from '../../../lib/date.ts';
import { useColorMode } from '../../../lib/theme.ts';
import { formatYen } from '../../../lib/yen.ts';
import { axisRange, type ChartWindow, formatAxisYen, toSeries } from '../balance-chart.ts';

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
  /** 横軸の範囲 */
  axis: ChartWindow;
  /** 最初に出す期間。その後の期間はグラフ（dataZoom）が持つ */
  initial: ChartWindow;
  /** 操作で出している期間が変わったとき */
  onWindowChange: (window: ChartWindow) => void;
};

/**
 * 残高の推移の、塗りつぶし付きの折れ線グラフ（ECharts）。選んだ口座を積み上げる。
 * - ピンチ・ホイールで期間を拡大縮小し、ドラッグで前後へ動かす（dataZoom の inside）。期間はグラフが持ち、
 *   変わるたびに onWindowChange で知らせる（option には入れないので、操作のたびに系列を作り直さない）
 * - 縦軸は出している期間の値の最小と最大から少し広げた範囲（`axisRange`。dataZoom の filter で期間の外の値は除いて測る）
 * - グラフのどこかを押す・マウスを乗せると、その日の日付と金額（2 つ以上なら合計も）が出る
 * 口座はすべて系列として持ち、出さない口座は凡例の選択で隠す（系列の順が変わらないので、色が口座ごとに決まる）。
 */
export function BalanceChart({
  balances,
  accounts,
  selected,
  axis,
  initial,
  onWindowChange,
}: Props) {
  const mode = useColorMode();
  const option = useMemo(
    () => chartOption(balances, accounts, selected, axis),
    [balances, accounts, selected, axis],
  );
  const ref = useECharts(mode, option, initial, onWindowChange);
  return <div ref={ref} style={{ height: '100%' }} />;
}

/**
 * ECharts を div に描く。色の向き（mode）が変わったら作り直し（そのときの期間は引き継ぐ）、大きさは要素の大きさに
 * 合わせ続け、option が変わったら差分を当てる。期間の操作（dataZoom）で変わった期間を onWindowChange に渡す。
 * 期間は操作の知らせの後に dataZoom から読む（知らせが持つのは割合で、その基準は横軸の min・max ではなくグラフの内部の範囲なので、
 * 値に直せない）。
 * WHY NOT echarts-for-react: CommonJS だけで配られていて、Vite の本番の束ねでは default の読み込みが部品にならない。
 * 要るのは作る・合わせる・捨てるだけなので、ECharts の API を直に呼ぶ。
 */
function useECharts(
  mode: 'light' | 'dark',
  option: ChartOption,
  initial: ChartWindow,
  onWindowChange: (window: ChartWindow) => void,
) {
  const ref = useRef<HTMLDivElement>(null);
  const [chart, setChart] = useState<echarts.ECharts | null>(null);
  // 知らせのたびに読む最新の値（作り直さずに済むよう ref で持つ）。作り直すときはそのときの期間を引き継ぐ
  const latest = useRef({ window: initial, onWindowChange });
  latest.current.onWindowChange = onWindowChange;
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const instance = echarts.init(element, mode === 'dark' ? 'dark' : undefined);
    instance.on('datazoom', () => {
      const [zoom] = instance.getOption().dataZoom as DataZoomComponentOption[];
      if (zoom?.startValue === undefined || zoom.endValue === undefined) return;
      const window = { start: Number(zoom.startValue), end: Number(zoom.endValue) };
      latest.current.window = window;
      latest.current.onWindowChange(window);
    });
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(element);
    setChart(instance);
    return () => {
      observer.disconnect();
      instance.dispose();
    };
  }, [mode]);
  useEffect(() => {
    // 期間は今の期間（グラフが知らせてきた物）を付けて当てる。付けないと、横軸が伸びたとき（古いほうを読み足したとき）に
    // 割合のまま残って、出している期間がずれる
    const { start, end } = latest.current.window;
    chart?.setOption({ ...option, dataZoom: [{ ...DATA_ZOOM, startValue: start, endValue: end }] });
  }, [chart, option]);
  return ref;
}

/** 期間の操作 */
const DATA_ZOOM: DataZoomComponentOption = {
  type: 'inside',
  filterMode: 'filter',
  minValueSpan: MIN_SPAN,
};

function chartOption(
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
  const points = params.map((param) => ({
    param,
    point: param.value as [number, number | null],
  }));
  const rows = points.flatMap(({ param, point: [, amount] }) =>
    amount === null
      ? []
      : [{ label: `${param.marker}${escapeHtml(param.seriesName ?? '')}`, amount }],
  );
  const day = points[0]?.point[0];
  return [
    ...(day === undefined ? [] : [formatDateWithYear(new Date(day))]),
    ...rows.map((row) => `${row.label} ${formatYen(row.amount)}`),
    ...(rows.length > 1
      ? [`合計 ${formatYen(rows.reduce((sum, row) => sum + row.amount, 0))}`]
      : []),
  ].join('<br>');
}

/** 口座の名前を HTML に差し込むので、タグにならないようにする（ECharts の tooltip は HTML で描く） */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
