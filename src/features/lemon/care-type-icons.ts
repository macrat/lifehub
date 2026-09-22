import type { SvgIconComponent } from '@mui/icons-material';
import ArrowCircleDownOutlinedIcon from '@mui/icons-material/ArrowCircleDownOutlined';
import CompostOutlinedIcon from '@mui/icons-material/CompostOutlined';
import LocalFloristOutlinedIcon from '@mui/icons-material/LocalFloristOutlined';
import ShoppingBasketOutlinedIcon from '@mui/icons-material/ShoppingBasketOutlined';
import ShowerOutlinedIcon from '@mui/icons-material/ShowerOutlined';
import WaterDropOutlinedIcon from '@mui/icons-material/WaterDropOutlined';
import type { CareType } from '../../../shared/validation/lemon.ts';

/**
 * 項目ごとのアイコン。記録の一覧で 1 行に 6 つ分の枠を並べ、やったものだけを出す。
 * 字を読まずに「そのとき何をしたか」が分かるようにするものなので、
 * 似た形が並ばないよう、水の形（葉水のシャワー・水やりのしずく）だけは別の輪郭にする。
 * 線画（Outlined）に揃えるのは、アイコンが 6 つ並んでも一覧の文字より目立たせないため。
 */
export const CARE_TYPE_ICONS: Record<CareType, SvgIconComponent> = {
  mist: ShowerOutlinedIcon,
  water: WaterDropOutlinedIcon,
  fertilize: CompostOutlinedIcon,
  bloom: LocalFloristOutlinedIcon,
  // 丸いものが下へ行く形。落ちた実そのものの絵は無いので、輪郭と向きで示す
  drop: ArrowCircleDownOutlinedIcon,
  harvest: ShoppingBasketOutlinedIcon,
};
