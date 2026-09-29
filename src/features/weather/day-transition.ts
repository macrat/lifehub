import type { DateString } from '../../../shared/types.ts';

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
 * 1 日の天気のアイコンに付ける名前（View Transition）。予定画面の日付の横・週間天気の行・ホームのタイルの
 * どこに出ても同じ日なら同じ名前にし、画面を行き来するとアイコンがその日の位置へその場から動く。
 * 日ごとに分けるのは、予定画面（月・週）にも週間天気にも日が並び、名前は文書の中で一意でなければならないため。
 * ホームのタイルのアイコンにも付けるのは、週間天気の行のアイコンにだけ名前があると、ホームと行き来するとき
 * 行（`HOME_WEATHER_TRANSITION`）はタイルから動くのに、行の中のアイコンだけが動かずにその場へ出るため。
 */
export function iconTransitionName(date: DateString): string {
  return `weather-icon-${date}`;
}
