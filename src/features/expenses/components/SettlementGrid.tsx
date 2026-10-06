import Typography from '@mui/material/Typography';
import { StatusTile, StatusTileSkeleton, TileGrid } from '../../../lib/ui/StatusTile.tsx';
import { formatYen } from '../../../lib/yen.ts';
import { useUserLabels } from '../../users/use-user-labels.ts';
import { partiesLabel } from '../parties.ts';
import type { Settlement } from '../queries.ts';

/**
 * 移動はユーザー 2 人と共有の 3 者で高々 2 つ（`settlementsOf`）なので、2 列で 1 行に収まる。
 * レモン画面の状況のタイルと同じ格子とタイル（`TileGrid`、`StatusTile`）を使う。
 */
const COLUMNS = 2;

type Props = {
  settlements: Settlement[];
  onSelect: (settlement: Settlement) => void;
};

/**
 * 立替を帳消しにする資金移動のタイル（立替画面）。見出しは「債権者 ← 債務者」（履歴の「To ← From」と同じ向きで、
 * 債務者が債権者に払えばよい）、その下に大きく金額。貸し借りのある組だけを出し、1 つも無ければ「精算済み」。
 * タップでその精算を入れた立替の入力を開く。
 */
export function SettlementGrid({ settlements, onSelect }: Props) {
  const { label } = useUserLabels();
  if (settlements.length === 0) return <Typography color="textSecondary">精算済み</Typography>;
  return (
    <TileGrid columns={COLUMNS}>
      {settlements.map((s) => (
        <StatusTile
          key={`${s.creditorId}:${s.debtorId}`}
          label={partiesLabel([s.creditorId, s.debtorId], label)}
          value={formatYen(s.amount)}
          onClick={() => onSelect(s)}
        />
      ))}
    </TileGrid>
  );
}

/** 読み込み中の骨組み。移動の数は読むまで分からないので、タイル 1 つ分 */
export function SettlementGridSkeleton() {
  return (
    <TileGrid columns={COLUMNS}>
      <StatusTileSkeleton withSub={false} />
    </TileGrid>
  );
}
