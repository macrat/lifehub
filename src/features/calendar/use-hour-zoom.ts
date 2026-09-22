import { useCallback, useRef, useState } from 'react';
import { clamp } from '../../lib/math.ts';
import { useIsMobile } from '../../lib/ui/use-breakpoint.ts';

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
 * `atMinute` と同じ長さを数（px）で。スクロール位置を測る所だけがこちらを使う
 * （寸法は CSS に任せるが、scrollTop は数でしか指せない）。片方だけ直すと、
 * 描かれた時間軸と合わせる縦位置がずれるので、2 つは必ず並べて置く。
 */
export const pxAtMinute = (min: number, hourHeight: number) => (min / 60) * hourHeight;

/**
 * 週・日表示の時間軸の、1 時間あたりの高さ。つまむと（`use-pinch.ts`）縦に伸び縮みする。
 * 状態はカレンダー画面に 1 つだけ置き、スワイプの 3 面すべてに同じ値を渡す
 * （面ごとに持つと、拡げたあとスワイプした先だけ元の高さに戻ってしまう）。
 * 初めの高さだけ画面の幅で決め（指で触る画面は少し詰めて、見える時間帯を広く取る）、
 * あとはつまんだ結果をそのまま保つ。画面を回して幅が変わっても、見ていた高さは変えない。
 *
 * 積み上げるのは小数（手元の ref）、画面に出すのは整数に丸めた値（state）にする。
 * 小数で積むので指をゆっくり動かしたときの僅かな倍率も効き（丸めた値を積むと、毎回同じ数に
 * 戻って一向に変わらない）、整数で出すので、丸めて同じ高さになるフレームでは state が変わらず
 * 画面もまったく描き直されない。作られる CSS も高さの取り得る数（217 通り）で頭打ちになる。
 */
export function useHourZoom() {
  const base = useIsMobile() ? 48 : 56;
  const exact = useRef(base);
  const [hourHeight, setHourHeight] = useState(base);
  return {
    hourHeight,
    // 面（CalendarPane）を経由して渡るので、描き直しを省けるよう関数は固定する
    zoom: useCallback((ratio: number) => {
      exact.current = clamp(exact.current * ratio, MIN_HOUR_HEIGHT, MAX_HOUR_HEIGHT);
      setHourHeight(Math.round(exact.current));
    }, []),
  };
}
