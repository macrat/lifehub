import { useQuery } from '@tanstack/react-query';
import { CareStatusGrid } from '../../lemon/components/CareStatusGrid.tsx';
import { lemonStatusQueryOptions } from '../../lemon/queries.ts';
import { DashboardCardFrame } from './DashboardCardFrame.tsx';

/** レモン: 水やり・葉水それぞれの最終実施日からの経過日数。レモンページと同じクエリを読む */
export function LemonCard() {
  const { data = [], error } = useQuery(lemonStatusQueryOptions);
  const statuses = data.filter((s) => s.careType === 'water' || s.careType === 'mist');
  return (
    <DashboardCardFrame title="レモン" link={{ to: '/lemon' }} error={error}>
      <CareStatusGrid statuses={statuses} />
    </DashboardCardFrame>
  );
}
