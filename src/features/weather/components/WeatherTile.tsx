import Box from '@mui/material/Box';
import { StatusTile } from '../../../lib/ui/StatusTile.tsx';
import { formatTemp } from '../format.ts';
import type { HomeWeather } from '../queries.ts';
import { WeatherIcon } from './WeatherIcon.tsx';

type Props = {
  home: HomeWeather;
  onClick: () => void;
};

/**
 * ホームの天気のタイル（`StatusTile`）: 「今日」か「明日」、大きな天気のアイコンとその右に小さく天気の名前
 * （「晴後雨」など）、最高／最低気温の 3 段。どの日を出すかは `useHomeWeather` が決める。押すと週間天気の画面を開く。
 * アイコンは天気が変わる日も 1 文字分の正方形に重ねた形で出す。変わり方（後・時々）は右の名前で分かり、
 * 横並び（`/` `→`）にするとスマホのタイルの幅では名前が 1〜2 字しか入らないため。
 * 名前が入りきらないときは末尾を「…」で切る。
 * 予報の無い日（取り始める前など）は、ほかのタイルの「記録なし」と同じく値を「—」にする。
 */
export function WeatherTile({ home: { label, weather }, onClick }: Props) {
  return (
    <StatusTile
      label={label}
      value={
        weather ? (
          <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <WeatherIcon
              icon={weather.icon}
              layout="square"
              aria-hidden
              // 値の字の行と同じ高さにして、ほかのタイルと高さを揃える
              sx={{ display: 'block', flexShrink: 0, fontSize: '1.3em' }}
            />
            <Box
              component="span"
              sx={{
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontSize: '0.75rem',
                color: 'text.secondary',
              }}
            >
              {weather.label}
            </Box>
          </Box>
        ) : (
          '—'
        )
      }
      sub={weather ? `${formatTemp(weather.tempMax)} / ${formatTemp(weather.tempMin)}` : '予報なし'}
      onClick={onClick}
    />
  );
}
