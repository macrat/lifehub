import Box from '@mui/material/Box';
import type { ReactNode } from 'react';
import type { DailyWeather } from '../../../../shared/weather.ts';
import { WeatherIcon } from './WeatherIcon.tsx';
import { WIDE_RATIO } from './weather-glyphs.ts';

/** 天気と、隣の物（日付の数字）とのあいだの余白（px）。枠の端とのあいだには 2px 取る */
const GAP = 2;

type Props = {
  weather: DailyWeather;
  /** アイコンの大きさ（px）。気温の字はこれより一回り小さくする */
  size: number;
};

/**
 * 日付の横に出す天気のアイコンと最高気温。天気の名前（「晴時々曇」など）はホバーと読み上げで出す。
 * 線画で文字と同じ控えめな色にするのは、日付の横に毎日並んでも予定より目立たせないため。
 * 置かれた所の残りの幅を自分の枠（コンテナ）にし、右端に寄せて出す。グリッドの中では右の列に、
 * 横並びの中では残りの幅に広がる（`gridColumn` と `flex` は、置かれた側の並べ方のほうだけが効く）。
 *
 * 狭いときは気温、横並びのアイコン、正方形のアイコンの順に諦める。気温は 1 行に入りきらなければ
 * 次の行へ折り返し、高さで切れて見えなくなる（字の幅を見積もらず、入るかどうかはブラウザに任せる）。
 * アイコンは幅が固定なので、枠がその幅より狭いときにコンテナクエリで切り替える。天気が変わる日は、
 * 横並びが入らなければ 1 文字分に重ねた形にし（変わり方の印は無くなるが、どの天気かは分かる）、
 * それも入らなければ隠す。重ねた形のときは気温も出さない（入っても、横並びより広い枠で気温が消え、
 * 狭い枠で戻るという逆転になるため）。
 */
export function DayWeather({ weather, size }: Props) {
  const wide = Math.ceil(size * WIDE_RATIO);
  const narrow = `@container (width < ${wide}px)`;
  const changes = 'change' in weather.icon;
  const iconSx = { fontSize: size };
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
        {changes ? (
          <>
            <WeatherIcon
              icon={weather.icon}
              layout="wide"
              titleAccess={weather.label}
              sx={{ ...iconSx, [narrow]: { display: 'none' } }}
            />
            <WeatherIcon
              icon={weather.icon}
              layout="square"
              titleAccess={weather.label}
              sx={{ ...iconSx, display: 'none', [narrow]: { display: 'inline-block' } }}
            />
          </>
        ) : (
          <WeatherIcon
            icon={weather.icon}
            layout="square"
            titleAccess={weather.label}
            sx={iconSx}
          />
        )}
        {weather.tempMax !== null && (
          <Box
            component="span"
            aria-label={`最高気温 ${weather.tempMax}度`}
            sx={{
              fontSize: Math.round(size * 0.8),
              lineHeight: `${size}px`,
              ...(changes && { [narrow]: { display: 'none' } }),
            }}
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
