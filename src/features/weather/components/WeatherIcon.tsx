import SvgIcon, { type SvgIconProps } from '@mui/material/SvgIcon';
import { useId } from 'react';
import type { WeatherIcon as Icon, WeatherSymbol } from '../../../../shared/weather.ts';
import { mergeSx } from '../../../lib/ui/merge-sx.ts';
import { GLYPHS, WIDE_WIDTH } from './weather-glyphs.ts';

/**
 * 部品を左上 (x, y) から一辺 size の正方形に置く（図形の座標系は Material Symbols と同じ 960 四方）。
 * 入れ子の svg は絵の一部なので読み上げない（天気の名前は外側のアイコンが持つ）。
 */
function Glyph({
  symbol,
  x,
  y,
  size,
}: {
  symbol: WeatherSymbol;
  x: number;
  y: number;
  size: number;
}) {
  return (
    <svg aria-hidden x={x} y={y} width={size} height={size} viewBox="0 -960 960 960">
      <path d={GLYPHS[symbol]} />
    </svg>
  );
}

/**
 * 変わり方の印。気象庁の予報のアイコンと同じく「時々」「一時」は `/`、「後」「から」は `→`。
 * 天気予報で見慣れた書き方なので、説明なしで読める。
 */
const CHANGE_MARKS = {
  sometimes: 'M24.6 5 21.4 19',
  later: 'M20.5 12h5M23.5 9.5l2.5 2.5-2.5 2.5',
} as const;

type Props = Omit<SvgIconProps, 'children'> & {
  icon: Icon;
  /**
   * 2 つの天気の並べ方。wide は気象庁と同じく左から右へ並べて間に印を置く（幅は高さの `wideRatio` 倍）。
   * square は 1 文字分の正方形に左上と右下へ重ねる（変わり方の印は入らないので、名前に任せる）。
   * 天気が 1 つの日は、どちらでも 1 文字分の正方形に 1 つだけ出す。
   */
  layout: 'wide' | 'square';
};

/** 1 日の天気のアイコン。色と大きさは文字と同じく `color` と `fontSize` に従う */
export function WeatherIcon({ icon, layout, sx, ...props }: Props) {
  const maskId = useId();
  if (!('change' in icon)) {
    return (
      <SvgIcon {...props} sx={sx}>
        <Glyph symbol={icon.symbol} x={0} y={0} size={24} />
      </SvgIcon>
    );
  }
  if (layout === 'wide') {
    return (
      <SvgIcon
        {...props}
        viewBox={`0 0 ${WIDE_WIDTH} 24`}
        sx={mergeSx({ width: `${WIDE_WIDTH / 24}em` }, sx)}
      >
        <Glyph symbol={icon.symbol} x={0} y={2} size={20} />
        <path
          d={CHANGE_MARKS[icon.change]}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Glyph symbol={icon.next} x={26} y={2} size={20} />
      </SvgIcon>
    );
  }
  // 右下の天気の周りを左上の天気から少し削り、重なった線が 1 つの形に見えないようにする
  return (
    <SvgIcon {...props} sx={sx}>
      <mask id={maskId}>
        <rect width={24} height={24} fill="white" />
        <g stroke="black" strokeWidth={150} strokeLinejoin="round">
          <Glyph symbol={icon.next} x={8} y={8} size={16} />
        </g>
      </mask>
      <g mask={`url(#${maskId})`}>
        <Glyph symbol={icon.symbol} x={0} y={0} size={16} />
      </g>
      <Glyph symbol={icon.next} x={8} y={8} size={16} />
    </SvgIcon>
  );
}
