import { CARE_TYPES } from '../../../../shared/validation/lemon.ts';
import { StatusTileSkeleton, TileGrid } from '../../../lib/ui/StatusTile.tsx';
import type { CareStatus } from '../queries.ts';
import { CareStatusTile } from './CareStatusTile.tsx';

/**
 * スマホは 3 列（6 項目が 2 行に収まり、記録フォームのチェックボックスと同じ並びになる）。
 * 広い画面では 1 行に並ぶ。
 */
const COLUMNS = { xs: 3, sm: CARE_TYPES.length };

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
    <TileGrid columns={COLUMNS}>
      {statuses.map((status) => (
        <CareStatusTile key={status.careType} status={status} onSelect={onSelect} />
      ))}
    </TileGrid>
  );
}

/** 読み込み中の骨組み。項目の数だけ同じ並びにタイルの骨組みを置き、読み込めたときに行の数も高さも変わらない */
export function CareStatusGridSkeleton() {
  return (
    <TileGrid columns={COLUMNS}>
      {CARE_TYPES.map((careType) => (
        <StatusTileSkeleton key={careType} />
      ))}
    </TileGrid>
  );
}
