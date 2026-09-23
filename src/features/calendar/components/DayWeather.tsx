import AcUnitOutlinedIcon from '@mui/icons-material/AcUnitOutlined';
import CloudOutlinedIcon from '@mui/icons-material/CloudOutlined';
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined';
import Box from '@mui/material/Box';
import SvgIcon, { type SvgIconProps } from '@mui/material/SvgIcon';
import type { ComponentType, ReactNode } from 'react';
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

/** 天気と、隣の物（日付の数字）とのあいだの余白（px）。枠の端とのあいだには 2px 取る */
const GAP = 2;

type Props = {
  weather: DailyWeather;
  /** アイコンの大きさ（px）。気温の字はこれより一回り小さくする */
  size: number;
};

/**
 * 日付の横に出す天気のアイコンと最高気温。天気の名前（「晴時々曇」など）はホバーと読み上げで出す。
 * 置かれた所の残りの幅を自分の枠（コンテナ）にし、右端に寄せて出す。グリッドの中では右の列に、
 * 横並びの中では残りの幅に広がる（`gridColumn` と `flex` は、置かれた側の並べ方のほうだけが効く）。
 *
 * 狭いときは気温、アイコンの順に隠す。気温は 1 行に入りきらなければ次の行へ折り返し、
 * 高さで切れて見えなくなる（字の幅を見積もらず、入るかどうかはブラウザに任せる）。
 * アイコンは幅が固定なので、枠がアイコンより狭いときだけコンテナクエリで隠す。
 */
export function DayWeather({ weather, size }: Props) {
  const Icon = ICONS[weather.kind];
  return (
    <Box
      sx={{
        gridColumn: 3,
        flex: 1,
        minWidth: 0,
        pl: `${GAP}px`,
        pr: '2px',
        containerType: 'inline-size',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
          alignItems: 'center',
          columnGap: '2px',
          height: size,
          overflow: 'hidden',
          color: 'text.secondary',
          [`@container (width < ${size}px)`]: { display: 'none' },
        }}
      >
        <Icon titleAccess={weather.label} sx={{ fontSize: size }} />
        {weather.tempMax !== null && (
          <Box
            component="span"
            aria-label={`最高気温 ${weather.tempMax}度`}
            sx={{ fontSize: Math.round(size * 0.8), lineHeight: `${size}px` }}
          >
            {weather.tempMax}°
          </Box>
        )}
      </Box>
    </Box>
  );
}

/**
 * 中央に置いた物（日付の数字）の右に天気を添える行。数字は枠の中央から動かさず、
 * 天気は右半分の余りに出す（左右を同じ幅の列にして、真ん中の列に数字を置く）。
 * 数字と天気の縦の位置は、行の中で中央に揃える。
 */
export function CenteredWithWeather({
  children,
  weather,
  size,
}: {
  children: ReactNode;
  weather: DailyWeather | undefined;
  size: number;
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        width: '100%',
      }}
    >
      <Box sx={{ gridColumn: 2, display: 'flex' }}>{children}</Box>
      {weather && <DayWeather weather={weather} size={size} />}
    </Box>
  );
}
