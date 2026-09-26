import { StatusTile } from '../../../lib/ui/StatusTile.tsx';
import { formatTemp } from '../format.ts';
import type { HomeWeather } from '../queries.ts';
import { WeatherIcon } from './WeatherIcon.tsx';

type Props = {
  home: HomeWeather;
  onClick: () => void;
};

/**
 * ホームの天気のタイル（`StatusTile`）: 「今日」か「明日」、大きな天気のアイコン、最高／最低気温の 3 段。
 * どの日を出すかは `useHomeWeather` が決める。押すと週間天気の画面を開く。
 * アイコンは天気が変わる日も気象庁と同じ横並び（`/` `→`）で出す（タイルの幅なら入る）。
 * 予報の無い日（取り始める前など）は、ほかのタイルの「記録なし」と同じく値を「—」にする。
 */
export function WeatherTile({ home: { label, weather }, onClick }: Props) {
  return (
    <StatusTile
      label={label}
      value={
        weather ? (
          <WeatherIcon
            icon={weather.icon}
            layout="wide"
            titleAccess={weather.label}
            // 値の字の行と同じ高さにして、ほかのタイルと高さを揃える
            sx={{ display: 'block', fontSize: '1.3em' }}
          />
        ) : (
          '—'
        )
      }
      sub={weather ? `${formatTemp(weather.tempMax)} / ${formatTemp(weather.tempMin)}` : '予報なし'}
      onClick={onClick}
    />
  );
}
