import Box from '@mui/material/Box';
import { memo } from 'react';
import type { DateString } from '../../../../shared/types.ts';
import type { HourlyWeather } from '../../../../shared/weather.ts';
import { WeatherIcon } from '../../weather/components/WeatherIcon.tsx';
import { useHourlyWeather } from '../queries.ts';
import { atMinute } from '../use-hour-zoom.ts';
import { HOURLY_ICON_SIZE, HOURLY_WEATHER_INSET } from './hourly-weather-layout.ts';

/** アイコンと線のあいだ、線と次のアイコンのあいだの余白（px） */
const GAP = 2;

/**
 * 日表示の時刻の左に出す 3 時間ごとの天気。天気が変わる時刻にアイコンを置き、その下に次の変わり目まで縦線を引く。
 * 天気の名前（「くもり」など）はホバーと読み上げで出す。
 * 時刻の欄（`TimeGrid` の左端の列）の左端に置き、縦の位置は時刻の字と同じく `atMinute` の calc で決める
 * （つまんで伸び縮みしてもブラウザが決め直す）。
 * 予定の脇に添える補助の情報なので、時刻の字より控えめな色（text.disabled）で小さく出す。
 * 気象庁の区切りは 3 時間ごとで時刻の目盛りと重なるので、アイコンは変わり目の時刻の字と縦の中央を揃える
 * （その日の最初の区間の 0:00 だけは、上にはみ出さないよう上端に揃える）。
 * 時間軸はドラッグの 1 コマごとに描き直されるので、props（日付）が変わらなければ描き直さない（memo）。
 */
export const HourlyWeatherColumn = memo(function HourlyWeatherColumn({
  date,
}: {
  date: DateString;
}) {
  return useHourlyWeather(date).map((span) => <HourlySpan key={span.startMin} span={span} />);
});

function HourlySpan({ span }: { span: HourlyWeather }) {
  const half = HOURLY_ICON_SIZE / 2;
  const top = `max(${atMinute(span.startMin)} - ${half}px, 0px)`;
  return (
    <Box
      sx={{
        position: 'absolute',
        left: HOURLY_WEATHER_INSET,
        width: HOURLY_ICON_SIZE,
        top,
        // 次の変わり目のアイコン（区間の終わりの時刻に中央を揃える）の手前まで
        height: `calc(${atMinute(span.endMin)} - ${top} - ${half + GAP}px)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: `${GAP}px`,
        color: 'text.disabled',
      }}
    >
      <WeatherIcon
        icon={{ symbol: span.symbol }}
        layout="square"
        titleAccess={span.label}
        sx={{ fontSize: HOURLY_ICON_SIZE, flexShrink: 0 }}
      />
      {/* 線はアイコンより長く続くので、アイコンより薄くして目立たせない */}
      <Box sx={{ flex: 1, width: '1px', bgcolor: 'currentColor', opacity: 0.5 }} />
    </Box>
  );
}
