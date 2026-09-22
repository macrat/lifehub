import { useCallback, useState } from 'react';
import { useIsMobile } from '../../lib/ui/use-breakpoint.ts';
import { clamp } from './draft.ts';

/**
 * 1 時間あたりの高さ（px）の下限・上限。下は 1 日 24 時間が画面に収まる所まで、
 * 上は 15 分の予定でも時刻が読める所まで。
 */
const MIN_HOUR_HEIGHT = 24;
const MAX_HOUR_HEIGHT = 240;

/**
 * 1 時間の高さを時間軸の中へ配る CSS 変数。値を置くのは `TimeGrid` のグリッド 1 つだけで、
 * 中の寸法（目盛り・罫線・予定のブロック・下書きの枠）はすべてここからの calc で決まる。
 */
export const HOUR_HEIGHT_VAR = '--hour-height';

/**
 * 0:00 から `min` 分の所までの縦の長さ（CSS の値）。
 * つまんで高さが変わってもブラウザが計算し直すので、JS は寸法を持たない。
 */
export const atMinute = (min: number) => `calc(var(${HOUR_HEIGHT_VAR}) * ${min / 60})`;

/**
 * 週・日表示の時間軸の、1 時間あたりの高さ。つまむと（`use-pinch.ts`）縦に伸び縮みする。
 * 状態はカレンダー画面に 1 つだけ置き、スワイプの 3 面すべてに同じ値を渡す
 * （面ごとに持つと、拡げたあとスワイプした先だけ元の高さに戻ってしまう）。
 * 初めの高さだけ画面の幅で決め（指で触る画面は少し詰めて、見える時間帯を広く取る）、
 * あとはつまんだ結果をそのまま保つ。画面を回して幅が変わっても、見ていた高さは変えない。
 *
 * 持つのは小数のまま、渡すのは整数に丸めた値にする。指をゆっくり動かしたときの僅かな倍率も
 * 積もって効き（丸めた値を持つと、毎回同じ数に戻って一向に変わらない）、渡す先から見れば
 * 高さは整数しか取らないので、同じ高さの間は面を描き直さずに済み、作られる CSS も増え続けない。
 */
export function useHourZoom() {
  const base = useIsMobile() ? 48 : 56;
  const [height, setHeight] = useState(base);
  return {
    hourHeight: Math.round(height),
    // 面（CalendarPane）を経由して渡るので、描き直しを省けるよう関数は固定する
    zoom: useCallback(
      (ratio: number) => setHeight((h) => clamp(h * ratio, MIN_HOUR_HEIGHT, MAX_HOUR_HEIGHT)),
      [],
    ),
  };
}
