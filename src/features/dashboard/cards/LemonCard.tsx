import { CareStatusGrid } from '../../lemon/components/CareStatusGrid.tsx';
import type { DashboardCardOf } from '../queries.ts';
import { DashboardCardFrame } from './DashboardCardFrame.tsx';

export function LemonCard({ card }: { card: DashboardCardOf<'lemon'> }) {
  return (
    <DashboardCardFrame title="レモン" link={{ to: '/lemon' }}>
      <CareStatusGrid statuses={card.data} />
    </DashboardCardFrame>
  );
}
