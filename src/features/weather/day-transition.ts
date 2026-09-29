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
 * 週間天気の画面を開く・閉じる遷移に付ける種別（View Transition の types。`src/main.tsx` の defaultViewTransition）。
 */
export const WEATHER_TRANSITION_TYPE = 'weather';

/**
 * 1 日の天気のアイコンに付ける名前（View Transition）。予定画面の日付の横・週間天気の行・ホームのタイルの
 * どこに出ても同じ日なら同じ名前にし、週間天気と行き来するとアイコンがその日の位置へその場から動く。
 * 日ごとに分けるのは、予定画面（月・週）にも週間天気にも日が並び、名前は文書の中で一意でなければならないため。
 * ホームのタイルのアイコンにも付けるのは、週間天気の行のアイコンにだけ名前があると、ホームと行き来するとき
 * 行（`HOME_WEATHER_TRANSITION`）はタイルから動くのに、行の中のアイコンだけが動かずにその場へ出るため。
 * 名前を付けた要素には `ONLY_IN_WEATHER_TRANSITION` も混ぜる。
 */
export function iconTransitionName(date: DateString): string {
  return `weather-icon-${date}`;
}

/**
 * 天気のアイコンの名前を、週間天気の画面を開く・閉じる遷移（`WEATHER_TRANSITION_TYPE`）の間だけ残す sx。
 * ホームと予定画面の両方に同じ日のアイコンがあるので、いつも名前を付けておくと、ホームと予定画面を
 * 行き来するときにもタイルのアイコンが日付の横へ飛んでいく（その間は画面ごとフェードする。`item-transition.ts`）。
 * 名前を付ける規則（コンテナクエリの中を含む）より詳細度が高いので、どこに混ぜても名前を消せる。
 * WHY NOT `:root`: Emotion は `:` で始まるセレクタの頭に自分のクラスを足すので、`:root` が要素自身に掛かってしまう。
 */
export const ONLY_IN_WEATHER_TRANSITION = {
  [`html:not(:active-view-transition-type(${WEATHER_TRANSITION_TYPE})) &`]: {
    viewTransitionName: 'none',
  },
} as const;
