import SvgIcon, { type SvgIconProps } from '@mui/material/SvgIcon';
import { useId } from 'react';
import { wedgeAngles, wedgePoints } from './wedges.ts';

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
 * 色は `VennMark` と同じ並びの扇形で分ける: 2 つは左右、3 つは Y の字、4 つは十字。
 * `fontSize` は `Checkbox` が大きさ（small など）に合わせて渡してくる。
 */
export function SplitCheckboxIcon({
  colors,
  checked,
  fontSize,
}: {
  colors: string[];
  checked: boolean;
  fontSize?: SvgIconProps['fontSize'];
}) {
  const id = useId();
  return (
    <SvgIcon fontSize={fontSize}>
      <clipPath id={id}>
        <path d={checked ? CHECKED : OUTLINE} />
      </clipPath>
      <g clipPath={`url(#${id})`}>
        {colors.length === 1 ? (
          <rect width={24} height={24} fill={colors[0]} />
        ) : (
          <g transform="translate(12 12)">
            {wedgeAngles(colors.length).map((angle, i) => (
              <polygon
                // biome-ignore lint/suspicious/noArrayIndexKey: 扇形は位置で決まり、並べ替わらない
                key={i}
                points={wedgePoints(angle, colors.length, 24)}
                fill={colors[i]}
              />
            ))}
          </g>
        )}
      </g>
    </SvgIcon>
  );
}
