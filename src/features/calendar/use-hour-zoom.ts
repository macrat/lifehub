import { useCallback, useState } from 'react';
import { useIsMobile } from '../../lib/ui/use-breakpoint.ts';

/**
 * 1 時間あたりの高さ（px）の下限・上限。下は 1 日 24 時間が画面に収まる所まで、
 * 上は 15 分の予定でも時刻が読める所まで。
 */
const MIN_HOUR_HEIGHT = 24;
const MAX_HOUR_HEIGHT = 240;

/**
 * 週・日表示の時間軸の、1 時間あたりの高さ。つまむと（`use-pinch.ts`）縦に伸び縮みする。
 * 状態はカレンダー画面に 1 つだけ置き、スワイプの 3 面すべてに同じ値を渡す
 * （面ごとに持つと、拡げたあとスワイプした先だけ元の高さに戻ってしまう）。
 * 初めの高さだけ画面の幅で決め（指で触る画面は少し詰めて、見える時間帯を広く取る）、
 * あとはつまんだ結果をそのまま保つ。画面を回して幅が変わっても、見ていた高さは変えない。
 */
export function useHourZoom() {
  const base = useIsMobile() ? 48 : 56;
  const [hourHeight, setHourHeight] = useState(base);
  return {
    hourHeight,
    // 面（CalendarPane）を経由して渡るので、描き直しを省けるよう関数は固定する
    zoom: useCallback(
      (ratio: number) =>
        setHourHeight((h) => Math.min(Math.max(h * ratio, MIN_HOUR_HEIGHT), MAX_HOUR_HEIGHT)),
      [],
    ),
  };
}
