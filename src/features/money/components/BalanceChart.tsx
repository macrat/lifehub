import { useMemo } from 'react';
import type { MoneyBalance } from '../../../../shared/money.ts';
import { useColorMode } from '../../../lib/theme.ts';
import { type ChartWindow, chartOption } from '../balance-chart.ts';
import { useECharts } from '../use-echarts.ts';

type Props = {
  balances: readonly MoneyBalance[];
  /** 口座の並び（環境変数の順）。積み上げの順と色はこの順で決まり、選ぶ口座を変えても同じ口座は同じ色 */
  accounts: readonly string[];
  /** 出す口座 */
  selected: readonly string[];
  /** 横軸の範囲 */
  axis: ChartWindow;
  /** 出している期間 */
  window: ChartWindow;
  /** 操作で出している期間が変わったとき */
  onWindowChange: (window: ChartWindow) => void;
};

/**
 * 残高の推移の、塗りつぶし付きの折れ線グラフ（ECharts）。選んだ口座を積み上げる。
 * - ピンチ・ホイールで期間を拡大縮小し、ドラッグで前後へ動かす（dataZoom の inside。`useECharts`）
 * - 縦軸は出している期間の値の最小と最大から少し広げた範囲（`axisRange`。dataZoom の filter で期間の外の値は除いて測る）
 * - グラフのどこかを押す・マウスを乗せると、その日の日付と金額（2 つ以上なら合計も）が出る
 * 口座はすべて系列として持ち、出さない口座は凡例の選択で隠す（系列の順が変わらないので、色が口座ごとに決まる）。
 */
export function BalanceChart({
  balances,
  accounts,
  selected,
  axis,
  window,
  onWindowChange,
}: Props) {
  const mode = useColorMode();
  const option = useMemo(
    () => chartOption(balances, accounts, selected, axis),
    [balances, accounts, selected, axis],
  );
  const ref = useECharts(mode, option, window, onWindowChange);
  return <div ref={ref} style={{ height: '100%' }} />;
}
