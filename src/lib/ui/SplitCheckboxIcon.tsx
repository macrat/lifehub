import SvgIcon, { type SvgIconProps } from '@mui/material/SvgIcon';
import { useId } from 'react';
import { WedgeFill } from './WedgeFill.tsx';

/**
 * MUI のチェックボックスの形（`@mui/icons-material` の CheckBoxOutlineBlank と CheckBox と同じ図形）。
 * WHY 図形を写す: アイコンのコンポーネントは色を 1 つ（currentColor）しか受け取れず、
 * 塗り分けるには形を切り抜きとして使う必要がある。
 */
const OUTLINE =
  'M19 5v14H5V5zm0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2';
const CHECKED =
  'M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2m-9 14-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8z';

/**
 * 複数の色で塗り分けたチェックボックスのアイコン（MUI の `Checkbox` の `icon`／`checkedIcon` に渡す）。
 * チェックボックスの形で `WedgeFill` を切り抜く。`Checkbox` が渡してくる大きさなどはそのまま `SvgIcon` へ。
 */
export function SplitCheckboxIcon({
  colors,
  checked,
  ...props
}: SvgIconProps & { colors: string[]; checked: boolean }) {
  const id = useId();
  return (
    <SvgIcon {...props}>
      <clipPath id={id}>
        <path d={checked ? CHECKED : OUTLINE} />
      </clipPath>
      {/* 切り抜きは translate の外に置く（clipPath は参照した要素の座標系で効くため） */}
      <g clipPath={`url(#${id})`}>
        <g transform="translate(12 12)">
          <WedgeFill colors={colors} reach={24} />
        </g>
      </g>
    </SvgIcon>
  );
}
