import AcUnitOutlinedIcon from '@mui/icons-material/AcUnitOutlined';
import CloudOutlinedIcon from '@mui/icons-material/CloudOutlined';
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined';
import Box from '@mui/material/Box';
import SvgIcon, { type SvgIconProps } from '@mui/material/SvgIcon';
import type { SxProps, Theme } from '@mui/material/styles';
import type { ComponentType } from 'react';
import type { DailyWeather, WeatherKind } from '../../../../shared/weather.ts';

/**
 * Material Symbols の `rainy`（Apache-2.0）。雨雲から雨が落ちる絵。
 * Material Icons（@mui/icons-material）の雨に近い絵は傘（`Umbrella`）だけで、線画は閉じた傘になり
 * 雨に見えないので、公式の図形だけをここに持つ（`src/features/lemon/care-type-icons.tsx` と同じ理由で、
 * アイコン 1 つのために Material Symbols のパッケージは足さない）。
 */
function RainyIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 -960 960 960">
      <path d="M558-84q-15 8-30.5 2.5T504-102l-60-120q-8-15-2.5-30.5T462-276q15-8 30.5-2.5T516-258l60 120q8 15 2.5 30.5T558-84Zm240 0q-15 8-30.5 2.5T744-102l-60-120q-8-15-2.5-30.5T702-276q15-8 30.5-2.5T756-258l60 120q8 15 2.5 30.5T798-84Zm-480 0q-15 8-30.5 2.5T264-102l-60-120q-8-15-2.5-30.5T222-276q15-8 30.5-2.5T276-258l60 120q8 15 2.5 30.5T318-84Zm-18-236q-91 0-155.5-64.5T80-540q0-83 55-145t136-73q32-57 87.5-89.5T480-880q90 0 156.5 57.5T717-679q69 6 116 57t47 122q0 75-52.5 127.5T700-320H300Zm0-80h400q42 0 71-29t29-71q0-42-29-71t-71-29h-60v-40q0-66-47-113t-113-47q-48 0-87.5 26T333-704l-10 24h-25q-57 2-97.5 42.5T160-540q0 58 41 99t99 41Zm180-200Z" />
    </SvgIcon>
  );
}

/**
 * 天気の種類ごとのアイコン。
 * 線画（Outlined）で文字と同じ控えめな色にするのは、日付の横に毎日並んでも予定より目立たせないため。
 */
const ICONS: Record<WeatherKind, ComponentType<SvgIconProps>> = {
  sunny: WbSunnyOutlinedIcon,
  cloudy: CloudOutlinedIcon,
  rainy: RainyIcon,
  snowy: AcUnitOutlinedIcon,
};

type Props = {
  weather: DailyWeather;
  /** アイコンの大きさ（px）。気温の字はこれより一回り小さくする */
  size: number;
  /**
   * 枠の中央に置いた物（日付の数字）の幅（px）。天気は枠の右端に置くので、枠の幅がこれと
   * 両脇の天気の分に足りなければ、気温、アイコンの順に隠す（中央の物に重ねない）。
   * 幅を測る枠は、祖先で一番近い `containerType: 'inline-size'` の要素。そういう枠が無ければ隠さない。
   */
  reserve?: number;
  sx?: SxProps<Theme>;
};

/** 片側の余白（px）。天気と中央の物のあいだと、天気と枠の端のあいだに取る */
const GAP = 2;

/**
 * 日付の横に出す天気のアイコンと最高気温。天気の名前（「晴時々曇」など）はホバーと読み上げで出す。
 * 狭いときに出す物を減らすのは CSS のコンテナクエリに任せる（幅を JS で測らない）。
 * 必要な幅は、天気が中央の物の右にあるとして、枠の中央から右半分に天気と余白が収まるかで決める。
 */
export function DayWeather({ weather, size, reserve = 0, sx }: Props) {
  const Icon = ICONS[weather.kind];
  const fontSize = Math.round(size * 0.8);
  // 「29°」の幅。数字 2 つと度の記号で字の 1.6 倍ほど（氷点下の「-3°」もおよそ同じ）
  const tempWidth = fontSize * 1.6;
  const iconNeeds = reserve + 2 * (size + GAP * 2);
  const tempNeeds = iconNeeds + 2 * (tempWidth + 2);
  return (
    <Box
      sx={[
        {
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          color: 'text.secondary',
          [`@container (width < ${iconNeeds}px)`]: { display: 'none' },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Icon titleAccess={weather.label} sx={{ fontSize: size }} />
      {weather.tempMax !== null && (
        <Box
          component="span"
          aria-label={`最高気温 ${weather.tempMax}度`}
          sx={{
            fontSize,
            lineHeight: 1,
            [`@container (width < ${tempNeeds}px)`]: { display: 'none' },
          }}
        >
          {weather.tempMax}°
        </Box>
      )}
    </Box>
  );
}
