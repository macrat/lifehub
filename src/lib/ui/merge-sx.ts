import type { SxProps, Theme } from '@mui/material/styles';

/**
 * sx を重ねる（後ろほど優先）。sx は 1 つのオブジェクトでも配列でもよいが、配列の中に配列は置けないので、
 * 呼び出し側から受け取った sx に部品側の sx を足すときは平らにして並べる（MUI の推奨する書き方）。
 * 省かれた sx（undefined）は並べない
 */
export function mergeSx(...sxs: (SxProps<Theme> | undefined)[]): SxProps<Theme> {
  return sxs.flatMap((sx) => (sx === undefined ? [] : Array.isArray(sx) ? sx : [sx]));
}
