import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { CareType } from '../../../../shared/validation/lemon.ts';
import { CareLogForm } from '../../lemon/components/CareLogForm.tsx';
import { CareStatusGrid } from '../../lemon/components/CareStatusGrid.tsx';
import { lemonStatusQueryOptions, useLogCare } from '../../lemon/queries.ts';
import { DashboardCardFrame } from './DashboardCardFrame.tsx';

/**
 * レモン: 水やり・葉水それぞれの最終実施日からの経過日数。レモンページと同じクエリを読む。
 * タイルをタップするとその種別の記録フォームが開く（レモンページと同じ操作）。
 */
export function LemonCard() {
  const { data = [], error } = useQuery(lemonStatusQueryOptions);
  const logCare = useLogCare();
  const [adding, setAdding] = useState<CareType | null>(null);
  const statuses = data.filter((s) => s.careType === 'water' || s.careType === 'mist');
  return (
    <DashboardCardFrame title="レモン" link={{ to: '/lemon' }} error={error}>
      <CareStatusGrid statuses={statuses} onSelect={(s) => setAdding(s.careType)} />
      {adding && (
        <CareLogForm
          initialCareType={adding}
          onSubmit={logCare.mutate}
          onClose={() => setAdding(null)}
        />
      )}
    </DashboardCardFrame>
  );
}
