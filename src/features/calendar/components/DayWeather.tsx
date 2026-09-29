import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import { createLink } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import type { DailyWeather } from '../../../../shared/weather.ts';
import { WeatherIcon } from '../../weather/components/WeatherIcon.tsx';
import { wideRatio } from '../../weather/components/weather-glyphs.ts';
import { openWeatherDay } from '../../weather/day-transition.ts';

/** 天気と、隣の物（日付の数字）とのあいだの余白（px）。枠の端とのあいだには 2px 取る */
const GAP = 2;

/** アイコンと気温のあいだの余白（px） */
const TEMP_GAP = 2;

// MUI の部品を router のリンクにする（`AppShell` と同じ）
const ButtonLink = createLink(ButtonBase);

type Props = {
  weather: DailyWeather;
  /** アイコンの大きさ（px）。気温の字はこれより一回り小さくする */
  size: number;
};

/**
 * 日付の横に出す天気のアイコンと最高気温。天気の名前（「晴時々曇」など）はホバーと読み上げで出す。
 * 押すと週間天気の画面へ移る（アイコンと気温の所だけが押せる。枠の残りは置かれた側の操作のまま）。
 * 置かれた側が押せる枠（週表示の見出し）でも、リンクをボタンの中に入れ子にしない（`TimelineHeader`）。
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
 * 押した日のアイコンは週間天気の同じ日のアイコンとその場で動く（`openWeatherDay`）。
 */
export function DayWeather({ weather, size }: Props) {
  // 横並びと気温が一緒に入らない幅。天気が 1 つの日は横並びも正方形なので、切り替えても見た目は変わらない
  const wide = Math.ceil(size * wideRatio(weather.icon));
  const temp = weather.tempMax === null ? null : `${weather.tempMax}°`;
  const tempWidth = temp === null ? '0px' : `${TEMP_GAP}px + ${temp.length}ch`;
  const narrow = `@container (width < calc(${wide}px + ${tempWidth}))`;
  const common = { icon: weather.icon, titleAccess: weather.label, transitionDate: weather.date };
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
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <ButtonLink
        to="/weather"
        onClick={() => openWeatherDay(weather.date)}
        aria-label={`週間天気（${weather.label}${weather.tempMax === null ? '' : `、最高気温 ${weather.tempMax}度`}）`}
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
          alignItems: 'center',
          columnGap: `${TEMP_GAP}px`,
          minWidth: 0,
          height: size,
          overflow: 'hidden',
          borderRadius: 1,
          font: 'inherit',
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
          <Box component="span" sx={{ lineHeight: `${size}px` }}>
            {temp}
          </Box>
        )}
      </ButtonLink>
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
  muted = false,
}: {
  children: ReactNode;
  weather: DailyWeather | undefined;
  size: number;
  /**
   * 表示中の月の外など、行ごと薄く出すとき。数字と天気は元の色が違う（曜日の色と text.secondary）ので、
   * 色を替えるのでなく行に同じ不透明度を掛けて、同じ割合で薄める
   */
  muted?: boolean;
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        width: '100%',
        opacity: muted ? (t) => t.palette.action.disabledOpacity : undefined,
      }}
    >
      <Box sx={{ gridColumn: 2, display: 'flex' }}>{children}</Box>
      {weather && <DayWeather weather={weather} size={size} />}
    </Box>
  );
}
