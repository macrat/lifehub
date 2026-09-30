import type { DateString } from '../../../shared/types.ts';
import { type TransitionEnds, useTransitionEnds } from '../../lib/view-transition.ts';
import { weatherSearchSchema } from './search.ts';

/**
 * ホームの天気のタイルと、週間天気の同じ日の行に付ける名前（View Transition）。
 * ホームと週間天気を行き来すると、タイルがその日の行へ（行がタイルへ）その場から動く。
 */
export const HOME_WEATHER_TRANSITION = 'home-weather';

/**
 * 週間天気の行の名前。タイルに出ている日（`useHomeWeatherDay`）の 1 行だけに付ける。
 * ほかの日はホームに無いので付けても相手がいない。そのうえ名前の付いた要素は画面の外にあっても撮られるので、
 * 付けるとスクロールの外の行まで画面の外から飛んでくる。
 */
export function dayTransitionName(date: DateString, homeDate: DateString): string | undefined {
  return date === homeDate ? HOME_WEATHER_TRANSITION : undefined;
}

/**
 * 1 日の天気のアイコンに付ける名前（View Transition。`WeatherIcon` が `useIconMoves` のときだけ付ける）。
 * 予定画面の日付の横・週間天気の行・ホームのタイルのどこに出ても同じ日なら同じ名前にする。
 * - 動かすのは週間天気で開いている日だけ（一斉に動かさない。docs/ui.md の「アニメーション」）
 * - ホームのタイルのアイコンにも付けるのは、週間天気の行のアイコンにだけ名前があると、ホームと行き来するとき
 *   行（`HOME_WEATHER_TRANSITION`）はタイルから動くのに、行の中のアイコンだけが動かずにその場へ出るため
 * - 隠れているアイコン（予定画面の横並びと重ねた形の片方）にも付いたままでよい。`display: none` の要素は撮られない
 */
export function iconTransitionName(date: DateString): string {
  return `weather-icon-${date}`;
}

/** 移動の前後のうち、週間天気の側で開いている日（`weatherSearchSchema` の day）。週間天気が前後に無ければ null */
function openedDayOf(ends: TransitionEnds | null): DateString | null {
  const weather = [ends?.from, ends?.to].find((location) => location?.pathname === '/weather');
  return weatherSearchSchema.safeParse(weather?.search).data?.day ?? null;
}

/**
 * このアイコンの日が、いまの移動で週間天気に開いている日か（そうならそのアイコンだけが動く）。
 * 週間天気の画面が前後に無い移動（ホームと予定画面の行き来など）では、どのアイコンも動かない。
 * 移動のたびに、結果が変わったアイコンだけが描き直される（`createStore` の select）
 */
export function useIconMoves(date: DateString | undefined): boolean {
  return useTransitionEnds((ends) => date !== undefined && openedDayOf(ends) === date);
}
