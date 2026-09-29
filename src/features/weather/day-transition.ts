import type { DateString } from '../../../shared/types.ts';
import { createStore } from '../../lib/store.ts';

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
 * 週間天気の画面が前後どちらかにある遷移の種別（View Transition の types。種別は前後の画面の名前で、
 * `src/main.tsx` の defaultViewTransition が付ける）。
 */
const WEATHER_TRANSITION_TYPE = 'weather';

/**
 * 週間天気を開いた日（予定画面で天気を押した日、ホームのタイルの日）。この日のアイコンだけが、週間天気との
 * 行き来でその場から動く（`iconTransitionName`）。週間天気から戻るときも同じ日が動いて、元の位置へ帰る。
 * WHY 1 日だけ: View Transition は動いたものを目で追わせて、次に見る所を伝えるためのもの。並んだ日のアイコンが
 * 一斉に動くと、どれを追えばよいか分からなくなる。
 * WHY NOT URL に持たせる: 戻った先（予定画面・ホーム）でも同じ日が要るが、戻った先の URL には入らない。
 */
export const [useOpenedWeatherDay, openWeatherDay] = createStore<DateString | null>(null);

/**
 * 1 日の天気のアイコンに付ける名前（View Transition。`WeatherIcon` が `transitionDate` と
 * `useOpenedWeatherDay` の日が同じときだけ付ける）。予定画面の日付の横・週間天気の行・ホームのタイルの
 * どこに出ても同じ日なら同じ名前にする。
 * - ホームのタイルのアイコンにも付けるのは、週間天気の行のアイコンにだけ名前があると、ホームと行き来するとき
 *   行（`HOME_WEATHER_TRANSITION`）はタイルから動くのに、行の中のアイコンだけが動かずにその場へ出るため
 * - 名前は週間天気の画面が前後にある遷移の間だけ残す（`ONLY_IN_WEATHER_TRANSITION`）。ホームと予定画面の両方に
 *   同じ日のアイコンがあるので、いつも残すとホームと予定画面の行き来でもタイルのアイコンが日付の横へ飛んでいく
 *   （その間は画面ごとフェードする。`item-transition.ts`）
 * - 隠れているアイコン（予定画面の横並びと重ねた形の片方）にも付いたままでよい。`display: none` の要素は撮られない
 */
export function iconTransitionName(date: DateString): string {
  return `weather-icon-${date}`;
}

/**
 * `iconTransitionName` を週間天気の画面が前後にある遷移の間だけ残す sx。名前は要素ごとに違うのでインラインの
 * style で付け（日ごとにクラスを作らない）、これは 1 つのクラスで `!important` にしてインラインの名前に勝たせる。
 * WHY NOT `:root`: Emotion は `:` で始まるセレクタの頭に自分のクラスを足すので、`:root` が要素自身に掛かってしまう。
 */
export const ONLY_IN_WEATHER_TRANSITION = {
  [`html:not(:active-view-transition-type(${WEATHER_TRANSITION_TYPE})) &`]: {
    viewTransitionName: 'none !important',
  },
} as const;
