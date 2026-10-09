import { LineChart } from 'echarts/charts';
import {
  AriaComponent,
  DataZoomInsideComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useRef, useState } from 'react';
import { type ChartOption, type ChartWindow, withWindow } from './balance-chart.ts';

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

/**
 * ECharts を div に描く。色の向き（mode）が変わったら作り直し、大きさは要素の大きさに合わせ続ける。
 * 期間の操作（dataZoom）は ECharts が描きながら進め、変わるたびに onWindowChange で知らせる。window は option を当てるとき
 * （作り直し・系列や横軸が変わったとき）にだけ添える: 操作のたびに当て直すと系列を作り直すことになり、添えずに当てると
 * 期間が横軸に対する割合のまま残って、横軸が伸びたとき（古いほうを読み足したとき）にずれる。
 * 期間は操作の知らせの後に dataZoom から読む（知らせが持つのは割合で、その基準は横軸の min・max ではなくグラフの内部の範囲なので、
 * 値に直せない）。
 * WHY NOT echarts-for-react: CommonJS だけで配られていて、Vite の本番の束ねでは default の読み込みが部品にならない。
 * 要るのは作る・合わせる・捨てるだけなので、ECharts の API を直に呼ぶ。
 */
export function useECharts(
  mode: 'light' | 'dark',
  option: ChartOption,
  window: ChartWindow,
  onWindowChange: (window: ChartWindow) => void,
) {
  const ref = useRef<HTMLDivElement>(null);
  const [chart, setChart] = useState<echarts.ECharts | null>(null);
  // 知らせと option の当て直しが読む最新の値（変わっても作り直さず、当て直しもしないよう ref で持つ）
  const latest = useRef({ window, onWindowChange });
  latest.current = { window, onWindowChange };
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const instance = echarts.init(element, mode === 'dark' ? 'dark' : undefined);
    // 指で動かしている間は 1 秒に何十回も届くので、描くごとに 1 度だけ読む（getOption は option 全体を写すので重い）
    let frame = 0;
    instance.on('datazoom', () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // 時間軸なので、期間は時刻の数で入っている
        const [zoom] = instance.getOption().dataZoom as { startValue: number; endValue: number }[];
        if (zoom) latest.current.onWindowChange({ start: zoom.startValue, end: zoom.endValue });
      });
    });
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(element);
    setChart(instance);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      instance.dispose();
    };
  }, [mode]);
  useEffect(() => {
    chart?.setOption(withWindow(option, latest.current.window));
  }, [chart, option]);
  return ref;
}
