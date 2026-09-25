import Box from '@mui/material/Box';
import { CARE_TYPES } from '../../../../shared/validation/lemon.ts';
import type { CareStatus } from '../queries.ts';
import { CareStatusTile } from './CareStatusTile.tsx';

type Props = {
  statuses: CareStatus[];
  onSelect?: (status: CareStatus) => void;
};

/**
 * 項目ごとの最終実施日と経過日数のタイル（`CareStatusTile`）を並べる（レモン画面）。
 * 記録の一覧はアイコンだけで並ぶので、同じ画面の上にあるこのタイルがその凡例になる（一覧の外に凡例を足さずに済む）。
 */
export function CareStatusGrid({ statuses, onSelect }: Props) {
  return (
    <Box
      sx={{
        display: 'grid',
        // スマホは 3 列（6 項目が 2 行に収まり、記録フォームのチェックボックスと同じ並びになる）。
        // 広い画面では自然に 1 行に並ぶ。
        gridTemplateColumns: {
          xs: 'repeat(3, minmax(0, 1fr))',
          sm: `repeat(${CARE_TYPES.length}, minmax(0, 1fr))`,
        },
        gap: 1,
      }}
    >
      {statuses.map((status) => (
        <CareStatusTile key={status.careType} status={status} onSelect={onSelect} />
      ))}
    </Box>
  );
}
