import { StatusTile } from '../../../lib/ui/StatusTile.tsx';
import { HOME_WEATHER_TRANSITION, iconTransitionName } from '../day-transition.ts';
import { formatTemp } from '../format.ts';
import type { HomeWeather } from '../queries.ts';
import { WeatherIcon } from './WeatherIcon.tsx';

type Props = {
  home: HomeWeather;
  onClick: () => void;
};

/**
 * ホームの天気のタイル（`StatusTile`）: 天気のアイコンと「今日」か「明日」、最高／最低気温、天気の名前
 * （「晴のち雨」など）の 3 段。葉水・水やりのタイルと同じ「アイコンと名前・大きな値・補足」の形に揃える。
 * どの日を出すかは `useHomeWeather` が決める。押すと週間天気の画面を開く。
 * 大きく出すのは気温にする。服装や支度を決めるのに要るのは数で、天気は名前とアイコンで足りる。
 * アイコンは名前の字の大きさなので、天気が変わる日も 1 文字分の正方形に重ねた形で出す（変わり方は名前で分かる）。
 * 名前が入りきらないとき（「曇時々雨で雷を伴う」など）は末尾を「…」で切り、全文は週間天気で見る。
 * 予報の無い日（取り始める前など）は、ほかのタイルの「記録なし」と同じく値を「—」にする。
 * 週間天気の同じ日の行とは名前を合わせてあり、行き来するとその場から動く（`HOME_WEATHER_TRANSITION`）。
 * アイコンも行のアイコンと名前を合わせてあり（`iconTransitionName`）、タイルと一緒に動く。
 */
export function WeatherTile({ home: { label, weather }, onClick }: Props) {
  return (
    <StatusTile
      icon={
        weather && (
          <WeatherIcon
            icon={weather.icon}
            layout="square"
            sx={{ viewTransitionName: iconTransitionName(weather.date) }}
          />
        )
      }
      label={label}
      value={weather ? `${formatTemp(weather.tempMax)} / ${formatTemp(weather.tempMin)}` : '—'}
      sub={weather ? weather.label : '予報なし'}
      transitionName={HOME_WEATHER_TRANSITION}
      onClick={onClick}
    />
  );
}
