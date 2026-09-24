import Box from '@mui/material/Box';
import type { ReactNode } from 'react';
import type { DailyWeather } from '../../../../shared/weather.ts';
import { WeatherIcon } from './WeatherIcon.tsx';
import { wideRatio } from './weather-glyphs.ts';

/** 天気と、隣の物（日付の数字）とのあいだの余白（px）。枠の端とのあいだには 2px 取る */
const GAP = 2;

/** アイコンと気温のあいだの余白（px） */
const TEMP_GAP = 2;

type Props = {
  weather: DailyWeather;
  /** アイコンの大きさ（px）。気温の字はこれより一回り小さくする */
  size: number;
  /** 表示中の月の外など、薄く出すとき。日付の数字（`DayNumber`）と同じ不透明度で薄める */
  muted?: boolean;
};

/**
 * 日付の横に出す天気のアイコンと最高気温。天気の名前（「晴時々曇」など）はホバーと読み上げで出す。
 * 線画で文字と同じ控えめな色にするのは、日付の横に毎日並んでも予定より目立たせないため。
 * 置かれた所の残りの幅を自分の枠（コンテナ）にし、右端に寄せて出す。グリッドの中では右の列に、
 * 横並びの中では残りの幅に広がる（`gridColumn` と `flex` は、置かれた側の並べ方のほうだけが効く）。
 *
 * 狭いときは、横並びのアイコン（天気が変わる日の `/` `→`）、気温、正方形のアイコンの順に諦める。
 * 気温より変わり方の印を先に諦めるのは、どの天気が混ざるかは重ねた形でも分かり、変わり方は名前でも
 * 分かる一方、気温はほかで分からないため。
 * - 横並びは、横並びと気温が両方入る幅が無ければ、コンテナクエリで 1 文字分に重ねた形に切り替える。
 *   気温の幅は字数分の ch と見る（ch は数字 1 字の幅で、「°」「-」はそれより狭いので上限になる）。
 * - 気温は 1 行に入りきらなければ次の行へ折り返し、高さで切れて見えなくなる（入るかどうかはブラウザに任せる）。
 * - アイコンは、枠が正方形のアイコンより狭いときにコンテナクエリで隠す。
 */
export function DayWeather({ weather, size, muted = false }: Props) {
  // 横並びと気温が一緒に入らない幅。天気が 1 つの日は横並びも正方形なので、切り替えても見た目は変わらない
  const wide = Math.ceil(size * wideRatio(weather.icon));
  const temp = weather.tempMax === null ? null : `${weather.tempMax}°`;
  const tempWidth = temp === null ? '0px' : `${TEMP_GAP}px + ${temp.length}ch`;
  const narrow = `@container (width < calc(${wide}px + ${tempWidth}))`;
  const common = { icon: weather.icon, titleAccess: weather.label };
  return (
    <Box
      sx={{
        gridColumn: 3,
        flex: 1,
        minWidth: 0,
        pl: `${GAP}px`,
        pr: '2px',
        containerType: 'inline-size',
        // コンテナクエリの ch を気温の数字の幅にする
        fontSize: Math.round(size * 0.8),
        opacity: muted ? (t) => t.palette.action.disabledOpacity : undefined,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
          alignItems: 'center',
          columnGap: `${TEMP_GAP}px`,
          height: size,
          overflow: 'hidden',
          color: 'text.secondary',
          [`@container (width < ${size}px)`]: { display: 'none' },
        }}
      >
        <WeatherIcon
          {...common}
          layout="wide"
          sx={{ fontSize: size, [narrow]: { display: 'none' } }}
        />
        <WeatherIcon
          {...common}
          layout="square"
          sx={{ fontSize: size, display: 'none', [narrow]: { display: 'inline-block' } }}
        />
        {temp !== null && (
          <Box
            component="span"
            aria-label={`最高気温 ${weather.tempMax}度`}
            sx={{ lineHeight: `${size}px` }}
          >
            {temp}
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
  muted,
}: {
  children: ReactNode;
  weather: DailyWeather | undefined;
  size: number;
  /** 天気を薄く出すか（`DayWeather`）。数字の薄さは数字の側で指定する */
  muted?: boolean;
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
      {weather && <DayWeather weather={weather} size={size} muted={muted} />}
    </Box>
  );
}
