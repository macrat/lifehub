import ArrowCircleDownOutlinedIcon from '@mui/icons-material/ArrowCircleDownOutlined';
import CompostOutlinedIcon from '@mui/icons-material/CompostOutlined';
import LocalFloristOutlinedIcon from '@mui/icons-material/LocalFloristOutlined';
import ShoppingBasketOutlinedIcon from '@mui/icons-material/ShoppingBasketOutlined';
import WaterDropOutlinedIcon from '@mui/icons-material/WaterDropOutlined';
import SvgIcon, { type SvgIconProps } from '@mui/material/SvgIcon';
import type { ComponentType } from 'react';
import type { CareType } from '../../../shared/validation/lemon.ts';

/**
 * Material Symbols の `nest_eco_leaf`（Apache-2.0）。葉水に使う。
 * Material Symbols は @mui/icons-material（Material Icons）に含まれないので、
 * 同じ絵を出すために公式の図形だけをここに持つ。アイコン 1 つのために
 * Material Symbols のフォントや SVG のパッケージと読み込みの仕組みを足すと、
 * 増える重さと組み立てが図形 1 つに見合わない。
 */
function NestEcoLeafIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 -960 960 960">
      <path d="M480-160q-56 0-105.5-17.5T284-227l-56 55q-11 11-28 11t-28-11q-11-11-11-28t11-28l55-55q-32-41-49.5-91T160-480q0-134 93-227t227-93h320v320q0 134-93 227t-227 93Zm0-80q100 0 170-70t70-170v-240H480q-100 0-170 70t-70 170q0 39 12 74.5t33 64.5l207-207q11-11 28-11t28 11q12 12 12 28.5T548-491L341-284q29 21 64.5 32.5T480-240Zm0-240Z" />
    </SvgIcon>
  );
}

/**
 * 項目ごとのアイコン。記録の一覧で 1 行に 6 つ分の枠を並べ、やったものだけを出す。
 * 字を読まずに「そのとき何をしたか」が分かるようにするものなので、
 * 似た形が並ばないよう、水の形（葉水の葉・水やりのしずく）だけは別の輪郭にする。
 * 線画（Outlined）に揃えるのは、アイコンが 6 つ並んでも一覧の文字より目立たせないため。
 */
export const CARE_TYPE_ICONS: Record<CareType, ComponentType<SvgIconProps>> = {
  mist: NestEcoLeafIcon,
  water: WaterDropOutlinedIcon,
  fertilize: CompostOutlinedIcon,
  bloom: LocalFloristOutlinedIcon,
  // 丸いものが下へ行く形。落ちた実そのものの絵は無いので、輪郭と向きで示す
  drop: ArrowCircleDownOutlinedIcon,
  harvest: ShoppingBasketOutlinedIcon,
};
