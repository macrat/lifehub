import Skeleton from '@mui/material/Skeleton';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { CareType } from '../../../../shared/validation/lemon.ts';
import { QueryView } from '../../../lib/ui/QueryView.tsx';
import { CareLogForm } from '../../lemon/components/CareLogForm.tsx';
import { CareStatusGrid } from '../../lemon/components/CareStatusGrid.tsx';
import { lemonStatusQueryOptions, useLogCare } from '../../lemon/queries.ts';
import { DashboardCardFrame } from './DashboardCardFrame.tsx';

/**
 * レモン: 水やり・葉水それぞれの最終実施日からの経過日数。レモンページと同じクエリを読む。
 * タイルをタップするとその種別の記録フォームが開く（レモンページと同じ操作）。
 */
export function LemonCard() {
  const query = useQuery(lemonStatusQueryOptions);
  const logCare = useLogCare();
  const [adding, setAdding] = useState<CareType | null>(null);
  return (
    <DashboardCardFrame title="レモン" link={{ to: '/lemon' }}>
      <QueryView query={query} skeleton={<Skeleton variant="rounded" height={86} />}>
        {(statuses) => (
          <CareStatusGrid
            statuses={statuses.filter((s) => s.careType === 'water' || s.careType === 'mist')}
            onSelect={(s) => setAdding(s.careType)}
          />
        )}
      </QueryView>
      {adding && (
        <CareLogForm
          initialCareType={adding}
          onSubmit={logCare.mutateAsync}
          onClose={() => setAdding(null)}
        />
      )}
    </DashboardCardFrame>
  );
}
