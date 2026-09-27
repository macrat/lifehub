import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { PopSlot, WeatherSlot } from '../../../../shared/weather.ts';
import { formatTemp } from '../format.ts';
import { WeatherIcon } from './WeatherIcon.tsx';

/** 3 時間ごとの枠の始まり（その日の 0:00 からの分）。気象庁の区切りと同じく 0 時から 3 時間ごと */
const SLOTS = Array.from({ length: 8 }, (_, i) => i * 180);

/** 降水確率の区間の始まり（分）。気象庁の降水確率は 0 時から 6 時間ごとで、3 時間の枠 2 つ分 */
const POP_SLOTS = Array.from({ length: 4 }, (_, i) => i * 360);

type Props = {
  slots: WeatherSlot[];
  pops: PopSlot[];
};

/**
 * 1 日の 3 時間ごとの天気。0・3・6…21 時の 8 列に、時刻・天気のアイコン（天気の名前はホバーと読み上げ）・
 * その時刻の気温を縦に並べ、一番下に 6 時間ごとの降水確率を 2 列ずつにまたがせて出す。
 * 降水確率を 3 時間ごとに割らないのは、気象庁の予報が 6 時間ごとで、2 つの列に同じ値を並べると
 * 3 時間ごとの値に見えてしまうため。
 * 予報の無い枠（取り始める前・発表より前に過ぎた時間帯、明日より先の降水確率）は空けておき、どの日も同じ時刻が
 * 同じ位置に来るようにする。
 */
export function HourlyForecast({ slots, pops }: Props) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${SLOTS.length}, minmax(0, 1fr))`,
        rowGap: 0.5,
        px: 2,
        pb: 1.5,
        textAlign: 'center',
      }}
    >
      {SLOTS.map((min) => (
        <Typography key={min} variant="caption" color="textSecondary">
          {min / 60}時
        </Typography>
      ))}
      {SLOTS.map((min) => {
        const slot = slots.find((s) => s.startMin === min);
        return slot ? (
          <WeatherIcon
            key={min}
            icon={{ symbol: slot.symbol }}
            layout="square"
            titleAccess={slot.label}
            sx={{ fontSize: 24, color: 'text.secondary', justifySelf: 'center' }}
          />
        ) : (
          <Box key={min} sx={{ height: 24 }} />
        );
      })}
      {SLOTS.map((min) => {
        const slot = slots.find((s) => s.startMin === min);
        return (
          <Typography key={min} variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {slot ? formatTemp(slot.temp) : ''}
          </Typography>
        );
      })}
      {POP_SLOTS.map((min) => {
        const pop = pops.find((p) => p.startMin === min);
        return (
          <Typography
            key={min}
            variant="caption"
            color="textSecondary"
            sx={{
              gridColumn: 'span 2',
              mx: 0.5,
              // 2 列にまたがる値だと分かるよう、区間の幅に線を引く
              borderTop: 1,
              borderColor: 'divider',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {pop && `${pop.pop}%`}
          </Typography>
        );
      })}
    </Box>
  );
}
