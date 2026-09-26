import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { HourlyWeather } from '../../../../shared/weather.ts';
import { WeatherIcon } from './WeatherIcon.tsx';

/** 3 時間ごとの区切り（その日の 0:00 からの分）。気象庁の区切りと同じく 0 時から 3 時間ごと */
const SLOTS = Array.from({ length: 8 }, (_, i) => i * 180);

/**
 * 1 日の 3 時間ごとの天気。0・3・6…21 時の 8 つの枠を横に並べ、それぞれに時刻と天気のアイコンを出す
 * （天気の名前はホバーと読み上げ）。受け取るのは同じ天気が続く区間（`HourlyWeather`）なので、枠ごとに割り戻す。
 * 予報の無い枠（取り始める前・発表より前の時間帯）は時刻だけを出して空けておき、どの日も同じ時刻が同じ位置に来るようにする。
 */
export function HourlyForecast({ hourly }: { hourly: HourlyWeather[] }) {
  const at = (min: number) => hourly.find((w) => w.startMin <= min && min < w.endMin);
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${SLOTS.length}, minmax(0, 1fr))`,
        px: 2,
        pb: 1.5,
      }}
    >
      {SLOTS.map((min) => {
        const weather = at(min);
        return (
          <Box
            key={min}
            sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}
          >
            <Typography variant="caption" color="textSecondary">
              {min / 60}時
            </Typography>
            {weather ? (
              <WeatherIcon
                icon={{ symbol: weather.symbol }}
                layout="square"
                titleAccess={weather.label}
                sx={{ fontSize: 24, color: 'text.secondary' }}
              />
            ) : (
              <Box sx={{ height: 24 }} />
            )}
          </Box>
        );
      })}
    </Box>
  );
}
